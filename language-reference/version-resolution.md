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
| Unversioned | `core/datastore/mariadb` | the highest version every constraint on it admits |

The caret form follows the major-compatible convention familiar from npm, Cargo,
and Go modules. In every form, resolution selects the **highest version that
satisfies the reference**, preferring stable releases over pre-releases. An exact
reference is the way to opt out of automatic selection and pin one version.

For a Component or Feature instance in a Release, the reference is not the only
constraint on its version; see [The constraints on an instance](#the-constraints-on-an-instance).

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

## The constraints on an instance

A Component or Feature instance in a Release is compiled at one version, and
three places can constrain which:

- **The Aggregate's `type:`.** An exact version or a caret range pins the
  instance as the table above describes; a type written with no version
  constrains nothing.
- **The Manifest key that maps the type.** A key in `components.type` or
  `features.type` that names a version, or a caret range, admits only the
  versions it reads as. A `name` entry adds no version constraint of its own.
- **The mapped Recipe's `spec.implements`.** The Recipe or FeatureRecipe the
  Manifest maps the instance to admits only the versions its `spec.implements`
  reads as. For a Component, a Recipe implementing a base the type `extends`
  admits the type's versions through that base; a Feature has no such ancestry.

The instance compiles at the **highest version every one of these constraints
admits**. A Recipe's `spec.implements` therefore narrows an unversioned instance
rather than being checked after the fact: with the catalog holding a Component at
`1.0.0` and `2.0.0`, an unversioned instance mapped to a Recipe implementing
`:^1.0.0` compiles at `1.0.0`.

Constraints are collected per reference as written in a Release, across the
Aggregate, its sub-aggregates and attachments. Every instance written with the
same type shares one reference, so they compile at one version and the constraints
of all of them apply to it.

A Manifest entry whose own key its Recipe's `spec.implements` refuses is reported
as that mapping fault (see the halting conditions for a Recipe `implements` that
does not match the mapped type) and adds no constraint of its own.

### When no version satisfies every constraint

If the catalog holds versions the reference alone admits but none that every
constraint admits, the build halts with `conflicting-version-constraints`: "no
version of a component or feature type satisfies every constraint declared on the
instance". The message names the Release, each instance with where it is declared
and its name, each constraint with the file it is written in, and the versions
held. The remedy is to change the Aggregate's version, or to map the type at a
version its Recipe implements.

### The lockfile

`aggrega pull` records the selected version in the reference's own lockfile row.
A build that reads a lockfile compiles at the recorded version, so a catalog
gaining a newer version changes nothing. If the recorded version falls outside
what the constraints now admit, the build halts with the same condition, naming
the lockfile and advising `aggrega pull --release <file>` to lock the version
every constraint admits. Against a local catalog directory, a selection that
differs from the recorded one is reported as the lockfile being out of date.

## Library dependencies

Reusable libraries (SchemaLibrary, MappingLibrary, WorkloadLibrary,
ArtifactLibrary) all resolve the same way. A library reference naming no version
selects the highest held version. A version written on a library reference is a
floor: it reads as `>=` that version within its major. Across several consumers
the build selects the highest held version every consumer's floor admits.
Consumers naming different majors of one library halt the build.

## When nothing satisfies a reference

If a reference pins a version, or a range, that no available version satisfies —
for example `:^2.0.0` when only `1.x` versions exist — resolution stops with an
error naming the reference as written, artifact and constraint together, rather
than silently falling back to a different version. A pull and a validate of the
same Release refuse it in the same words. Resolving a Release's dependencies reports
an artifact that does not exist at all in those same words too, since the reference
matched nothing either way — so read both halves of the reference the error names.
