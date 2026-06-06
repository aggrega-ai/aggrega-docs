# aggrega push

`aggrega push` publishes a catalog entity to an OCI registry, where other workspaces can resolve it with `aggrega pull`.

## Synopsis

```
aggrega push <entity-path> [--registry <ref>] [--dry-run]
```

## What it does

`aggrega push` reads a single entity YAML, bundles it for transport, and pushes it to `<registry>/<kind>/<metadata.name>:<metadata.version>`. The publishable kinds are the seven catalog kinds — Component, Feature, Recipe, FeatureRecipe, Provider, SchemaLibrary, and MappingLibrary — plus the Aggregate, which is a reusable module. Publishability is a property of the entity, not of how it is used: an Aggregate is publishable whether it is later referenced as a Release's top-level `spec.aggregate` or nested in another Aggregate's `aggregates:` block. Release and Manifest are deployment-side inputs, not catalog artifacts, and are rejected.

## Bundling

- Component, Feature, Provider, Aggregate, SchemaLibrary, and MappingLibrary publish as bare YAML.
- Recipe and FeatureRecipe publish as a `.tar.gz` that bundles the entity YAML together with its co-located source files — a filesystem `source:` directory, `$import:`-referenced template files, and inline `artifacts:`.

A remote `source:` URL on a Recipe (an OCI chart reference, an HTTPS chart or fragment URL, a Git module) is **preserved verbatim** in the published YAML; it is not pulled and vendored into the artifact. Consumers resolve and pin remote sources independently at their own pull time. This keeps catalog-entity distribution and source-artifact resolution as separate concerns.

An Aggregate publishes as its own single document: a sub-aggregate it references in `aggregates:` is **not** bundled into the artifact. Each sub-aggregate is a separately published Aggregate that consumers resolve and pin independently at pull time, by identity — the same separation-of-distribution principle that applies to remote sources.

## Registry, tag, and content-addressing

The target registry is `--registry <ref>` when supplied, otherwise the workspace's `default_registry` (`hub.aggrega.ai` by default). The tag is the entity's `metadata.version`. Libraries are enforced into a per-version subdirectory so a published version always lands at a predictable path.

Publish computes a content digest over the entity's authoring tree and embeds it in the OCI manifest; `aggrega pull` verifies that digest when it fetches the entity, so tampering between publish and pull is caught.

## Flags

- `<entity-path>` — the entity YAML to publish.
- `--registry <ref>` — override the workspace's default registry for this push.
- `--dry-run` — report what would be pushed without contacting the registry.

## Authentication

`aggrega push` uses the same standard registry authentication as `aggrega pull` — Docker / Podman / Helm config files and credential helpers. Run `docker login <registry>` (or `helm registry login <registry>` for Helm-specific OCI) before pushing to a private registry. See [`aggrega-pull.md`](aggrega-pull.md#authentication) for the full priority order.

## See also

- [./aggrega-lint.md](./aggrega-lint.md) — the publish gate (`--pre-publish`) that should precede a push.
- [./aggrega-pull.md](./aggrega-pull.md) — the consuming side, which resolves and pins what `push` publishes.
- [../../architecture/13-catalog-and-registry.md](../../architecture/13-catalog-and-registry.md) — the catalog, registry, and OCI mediatype model.
