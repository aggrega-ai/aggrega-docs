# aggrega pull

The `aggrega pull` subcommand will resolve and cache catalog artifacts (Components, Features, Recipes, FeatureRecipes, Providers, and their Wasm plugin binaries) from remote OCI registries into a local catalog directory. It is a planned addition to the CLI that is not yet available.

## Current state

`aggrega pull` does not ship today. Invoking it on a current CLI build prints an "unknown command" error and exits non-zero. Today's catalog workflow is filesystem-based: point the `--catalog` flag at a local directory tree containing the catalog entities, and the compiler reads them directly. Remote catalog distribution through OCI registries is a planned capability.

## Designed scope

When `aggrega pull` ships, the intended surface covers:

- **OCI registry resolution.** Catalog references of the form `<registry>/<namespace>/<kind>/<name>:<version>` resolve to an OCI image, whose layers are extracted into a local cache directory.
- **Transitive resolution.** Pulling an Aggregate or Release resolves every entity it references (recursively through `extends:`, `implements:`, `aggregate:`, and Feature attachments) and pulls the transitive closure into the cache.
- **Wasm artifact fetch.** Recipes and FeatureRecipes that reference Wasm artifacts have those artifacts fetched alongside the YAML manifests.
- **Cache discipline.** The cache is content-addressable; identical version pins share storage across Aggregates.

## Integration with other subcommands

Once pulled, the cache directory is consumed by `aggrega build` and `aggrega lint` via the `--catalog` flag (or a default cache location). Pulling is a separate step to keep the build loop offline-capable once the catalog has been cached locally.

## See also

- [./aggrega-build.md](./aggrega-build.md) — consumes the pulled catalog.
- [./global-flags.md](./global-flags.md) — the `--catalog` flag that points at the cache directory.
- [../providers/architecture.md](../providers/architecture.md) — provider Wasm artifacts that `pull` will fetch alongside YAML manifests.
