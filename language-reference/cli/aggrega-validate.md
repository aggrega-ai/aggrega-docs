# aggrega validate

`aggrega validate` checks **correctness** — schema, pillar structure, cross-document reference resolution, `extends` chains, provider input-kind capability, and (for a rendering entity) that it actually renders. It has three modes, selected by its argument, that apply the same correctness discipline at three scopes: the **whole catalog** (no argument), a single **Release's dependency closure** (`--release`), and **one entity** file (an entity path). Each scope answers the same question — "is this content correct?" — over a different slice of the catalog.

Correctness is distinct from conventions. `aggrega validate` asks whether content is well-formed and would compile; [`aggrega lint`](./aggrega-lint.md) asks whether content follows the catalog's publishing discipline (naming, category-directory alignment, version-bump size, and the rest). The two commands mirror each other's three scopes so you can check either dimension at whichever granularity you need.

`aggrega validate` writes nothing to disk and reads no runtime state. It runs the same resolution and validation a build runs, stopping before (or, for a single entity, isolating) the render.

## Synopsis

```
aggrega validate [<entity-path>] [--release <release-path>] [--catalog <dir>]...
```

An entity path may be given positionally. `--release` is mutually exclusive with an entity argument — they select different closures; passing both halts.

## Whole-catalog correctness (no argument)

`aggrega validate` with no argument loads every catalog entity under the configured catalog directories and checks it end-to-end:

- **Schema-pillar structure** — each Component's and Feature's `spec.schema:` block is expanded and validated (the same schema-pillar check the build applies), including compact-form expansion.
- **Cross-document reference resolution** — `$ref` and `$import` references into SchemaLibrary entries resolve, and a SchemaLibrary that cannot resolve or is otherwise invalid is rejected.
- **`extends` chains** — every entity that declares `extends` resolves against its parent, and the merged parent+child shape is checked.
- **OCI-location collisions** — two distinct catalog identities that would publish to the same registry location are rejected loudly, so a build never silently overwrites one entity's published bytes with another's.
- **Provider input-kind capability** — a Recipe or FeatureRecipe that declares a `workload:` block bound to a provider whose engine cannot synthesize is flagged as an error, because it can never build.

This is the catalog-wide counterpart to a build's per-Release validation — the place a broken catalog entity is meant to surface, before any Release reaches it. It halts loudly on any schema-pillar violation, unresolvable or invalid library, `extends`-resolution failure, location collision, or input-kind capability error. Schema-pillar-overlap and narrowing-on-extend findings are advisory `notice:` lines that never change the exit code.

Whole-catalog validation needs at least one catalog directory to scan: pass `--catalog` or set `workspace.catalog_dirs` in `.aggrega-config.yaml`. It refuses to enumerate the current working directory implicitly, so it never pulls in unrelated trees.

## Release-scoped correctness (`--release`)

`aggrega validate --release <release-path>` validates exactly the entities a single Release's resolved dependencies reach, rather than the whole catalog or one entity. It computes the closure through the **same machinery a build uses**, so the entities it checks are exactly the entities a build of that Release would resolve, and over that closure:

- resolves the closure-scoped `extends` chains, failing on a resolution error;
- validates each resolved entity's schema pillars (closure-scoped), failing on a schema-pillar error;
- runs the **same pre-render value conformance a build runs** — it resolves the Release's parameters into the authored values (so a `{{ .parameters.* }}` value is checked as resolved, not as a template) and validates the result against the closure's composed schemas, including conformance against the composed parent+child schema for an `extends`-ing entity. A value that violates its schema fails with a non-zero exit;
- applies the same provider input-kind capability check the whole-catalog mode runs, scoped to the closure;
- surfaces schema-pillar-overlap and narrowing-on-extend findings as informational `notice:` lines that never change the exit code.

This makes `--release` a true pre-build check: it catches what a build would reject, before the build — the build's dependency validation without the render. It runs no render and triggers no network pull: the closure resolves from the local catalog (and the Release's lockfile pins, when present); a registry-pinned dependency set that needs a lockfile surfaces an honest unresolvable-reference error rather than fetching. Narrowing is surfaced as advice, never enforced.

## Single-entity correctness (an entity path)

`aggrega validate <entity-path>` checks one catalog entity file. It applies a tiered set of checks, halting at the first blocking failure so a schema break surfaces loudly before any catalog work:

- **Schema envelope** (every kind) — the exact per-entity JSON-Schema check the catalog loader runs at each parse boundary.
- **Shape** (every kind) — the kind-specific structural validation.
- **Pillar structure** (Component and Feature) — the `spec.schema:` pillar check, using the catalog's SchemaLibraries for cross-document `$ref` expansion.

A **Component or Feature** stops there: schema envelope, shape, and pillar structure. A lone Component has no authored `values` or `infra` to render in isolation, so there is nothing to render — its correctness is fully covered by the schema-and-pillar tiers.

A **Recipe** additionally **renders in isolation**. This is one facet of single-entity correctness, not its headline: after the schema and shape tiers pass, validate resolves the Recipe's `implements` Component from the catalog, synthesizes a minimal deployment around a single instance of that Component bound to the Recipe under test, and drives the real compilation pipeline over it — first resolution and guards (with render skipped), then a real render of the isolated output. Required values are filled with typed placeholders and schema defaults flow through the resolver; the Release routes the instance into a synthesized default boundary and declares no `values:` and no compute the Aggregate did not declare. The rendered artifacts are printed so an author sees the isolated output before wiring the entity into a full Aggregate. Because a single-entity harness fills only required values and supplies no attached credential or topology edge, a Recipe whose template reads a value delivered only by such an input cannot render in isolation; validate reports that the render did not complete and surfaces the underlying render diagnostic, which is a genuine finding tempered by the harness's deliberate minimalism.

A **FeatureRecipe** is schema- and shape-checked; its render is skipped, because a FeatureRecipe renders only when attached to a host component, and synthesizing a guard-passing host for an arbitrary Feature is not attempted.

The single-entity mode's catalog load is tolerant: an unrelated broken entity elsewhere in the catalog is skipped rather than aborting the check, so it never blocks validating the target in isolation.

## How validate relates to lint and build

The three commands cover three different questions:

- **`aggrega validate`** — *is this correct?* Schema, pillars, references, `extends`, input-kind capability, and isolated render. It reads no runtime state and emits no artifacts.
- **[`aggrega lint`](./aggrega-lint.md)** — *does this follow catalog publishing conventions?* Naming, category-directory alignment, annotation prefixes, version-bump size, and the rest of the opt-in publishing discipline. Lint mirrors validate's three scopes but never checks correctness.
- **[`aggrega build`](./aggrega-build.md)** — *compile a complete deployment.* Build needs a full Aggregate + Manifest + Release closure and emits provider-native artifacts. It validates its own dependency closure as part of compiling, then renders. `aggrega validate --release` is that dependency validation on its own, without the render; single-entity validate isolates a single Recipe's render without a full Aggregate.

## Examples

Validate the whole catalog:

```
aggrega validate --catalog ./catalog
```

Validate exactly what one Release depends on, before building it:

```
aggrega validate --release releases/production.yaml
```

Validate one entity, and — for a Recipe — see its isolated rendered output:

```
aggrega validate core/datastore/postgres/recipes/helm.yaml
```

## See also

- [./aggrega-lint.md](./aggrega-lint.md) — the conventions counterpart across the same three scopes.
- [./aggrega-build.md](./aggrega-build.md) — compiles a complete Aggregate + Release into artifacts; validates its dependency closure as part of the compile.
- [./aggrega-inspect.md](./aggrega-inspect.md) — query the IR graph after resolution without proceeding to render.
- [../errors/warnings.md](../errors/warnings.md) — the advisory findings validate surfaces as `notice:` lines.

<!-- BEGIN GENERATED: cli-validate -->
**Synopsis**

```
aggrega validate [entity-path] [flags]
```

**Flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--catalog` | `[]` | Catalog directory; repeatable. Each --catalog is prepended to the workspace catalog_dirs search stack (first match wins). Defaults to the current directory. |
| `--plugin` | — | Path to a raw .wasm to validate against its describe() self-report — the pre-publish authoring check. Alone it needs --type; with a Plugin entity argument it cross-checks the binary against the entity's declared type, capability claim, command mirror, and host-function record. |
| `--release` | — | Path to a Release YAML to validate over its resolved dependency closure (mutually exclusive with an entity argument) |
| `--type` | — | Plugin type for a binary-only --plugin check, verified against the binary's self-reported type. Only meaningful with --plugin; when a Plugin entity supplies the type, omit it (a disagreeing value halts). |
<!-- END GENERATED: cli-validate -->
