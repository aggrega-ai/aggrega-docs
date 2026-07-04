# Version resolution

Catalog artifacts — Components, Features, Recipes, FeatureRecipes, Plugins,
and Aggregates — carry a `metadata.version`, and a catalog may hold more than one
version of the same artifact at once. When something references an artifact, the
reference selects which version to use. This page describes how that selection
works.

## Referencing a version

A reference is the artifact's type URI, optionally pinned to a version. Three
forms are accepted:

| Form | Example | Selects |
|------|---------|---------|
| Exact | `core/datastore/mariadb:1.2.0` | exactly that version |
| Range (caret) | `core/datastore/mariadb:^1.2.0` | the highest version `>= 1.2.0` and `< 2.0.0` |
| Unversioned | `core/datastore/mariadb` | the highest version available |

The caret form follows the major-compatible convention familiar from npm, Cargo,
and Go modules. In every form, resolution selects the **highest version that
satisfies the reference**, preferring stable releases over pre-releases. An exact
reference is the way to opt out of automatic selection and pin one version.

## Determinism

Selection runs once, when dependencies are locked. The resolved version and a
content fingerprint are recorded in the lockfile, and every later build reproduces
the exact same artifact from that record — so a catalog gaining a newer version
never silently changes a build that has already been locked. Re-locking is an
explicit action.

The same rule applies regardless of where the catalog lives: a local catalog
checkout and a registry resolve a reference to the same version.

## Library dependencies

Reusable schema and mapping libraries (SchemaLibrary, MappingLibrary) resolve
differently: they use **minimal version selection** — the lowest version that
satisfies all constraints across the workspace — again matching Go modules. This
keeps library upgrades deliberate rather than automatic.

## When nothing satisfies a reference

If a reference pins a version, or a range, that no available version satisfies —
for example `:^2.0.0` when only `1.x` versions exist — the build stops with a clear
error naming the artifact and the unsatisfiable constraint, rather than silently
falling back to a different version. Referencing an artifact that does not exist at
all is a separate, ordinary "not found" error.
