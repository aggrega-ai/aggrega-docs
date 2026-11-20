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

Selection runs once, when dependencies are locked. The lockfile records the
version the reference selected — a range reference is recorded at the version it
resolved to, never as the range — together with a content fingerprint taken over
that version's own document, and every later build reproduces the exact same
artifact from that record — so a catalog gaining a newer version never silently
changes a build that has already been locked. Re-locking is an explicit action.

The same rule applies regardless of where the catalog lives: a local catalog
checkout and a registry resolve a reference to the same version. It is also the
same rule for every command that reads the catalog. The pull that writes the
lockfile, the build that reads it, a validate, the editor and the assistant-facing
tools all select the same version from one catalog, however many versions of a
name its directories hold, and the build's check of the lockfile compares the
version it selected with the one the pull recorded.

## Library dependencies

Reusable libraries (SchemaLibrary, MappingLibrary, WorkloadLibrary,
ArtifactLibrary) resolve as a bare reference does: a version written on a library
reference is a floor, read as that version or later within its major, and the build
selects the highest held version every consumer's floor admits. Consumers naming
different majors of one library halt the build.

## When nothing satisfies a reference

If a reference pins a version, or a range, that no available version satisfies —
for example `:^2.0.0` when only `1.x` versions exist — resolution stops with an
error naming the reference as written, artifact and constraint together, rather
than silently falling back to a different version. A pull and a validate of the
same Release refuse it in the same words. Resolving a Release's dependencies reports
an artifact that does not exist at all in those same words too, since the reference
matched nothing either way — so read both halves of the reference the error names.
