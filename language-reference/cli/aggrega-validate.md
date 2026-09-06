# aggrega validate

`aggrega validate` checks **correctness** — schema, pillar structure, cross-document reference resolution, `extends` chains, provider input-kind capability, and (for a rendering entity) that it actually renders. It has three modes, selected by its argument, that apply the same correctness discipline at three scopes: the **whole catalog** (no argument), a single **Release's dependency closure** (`--release`), and **one entity** file (an entity path). Each scope answers the same question — "is this content correct?" — over a different slice of the catalog.

Correctness is distinct from conventions. `aggrega validate` asks whether content is well-formed and would compile; [`aggrega lint`](./aggrega-lint.md) asks whether content follows the catalog's publishing discipline (naming, category-directory alignment, version-bump size, and the rest). The two commands mirror each other's three scopes so you can check either dimension at whichever granularity you need.

`aggrega validate` writes nothing to disk and reads no runtime state. It runs the same resolution and validation a build runs, stopping before (or, for a single entity, isolating) the render.

An entity path may be given positionally. `--release` is mutually exclusive with an entity argument — they select different closures; passing both halts.

## Whole-catalog correctness (no argument)

`aggrega validate` with no argument loads every catalog entity under the configured catalog directories and checks it end-to-end:

- **Schema-pillar structure** — each Component's and Feature's `spec.schema:` block is expanded and validated (the same schema-pillar check the build applies), including compact-form expansion.
- **Cross-document reference resolution** — `$ref` and `$import` references into SchemaLibrary entries resolve, and a SchemaLibrary that cannot resolve or is otherwise invalid is rejected.
- **`extends` chains** — every entity that declares `extends` resolves against its parent, and the merged parent+child shape is checked.
- **OCI-location collisions** — two distinct catalog identities that would publish to the same registry location are rejected loudly, so a build never silently overwrites one entity's published bytes with another's.
- **Provider input-kind capability** — a Recipe or FeatureRecipe that declares a `workload:` block bound to a provider that cannot synthesize is flagged as an error, because it can never build.

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

Because it runs the same checks a build runs, it also runs the same attached gate plugins — so it is held to the same record of trusted plugin identities a build is held to. A workspace attaching a plugin that returns an accept-or-reject verdict has a [plugin trust record](./aggrega-pull.md#the-plugin-trust-record) beside its Release, and `--release` compares the configuration against it before any of those plugins runs: a recorded gate the configuration no longer attaches halts the validation, and a plugin resolved from the cache `aggrega pull` populates whose artifact is not the recorded one is refused rather than run. A workspace that has recorded nothing has no record, which changes nothing. The other two scopes are not held to it: they do not read the workspace's plugin attachments, so no such plugin runs in them.

The same holds for the plugins that **change** the graph rather than judging it. A `label-transform` or `annotation-transform` attachment shapes what the rendered output would be, so the lockfile pins both its identity and the source files it reads — and `--release` runs those attachments the way a build runs them: reconstructed from the lockfile, holding each one to its recorded digest, and reading the source content the lockfile carries rather than the file on disk. Two consequences are worth knowing before you meet them:

- **Attaching a transform plugin in `.aggrega-config.yaml` does not change what `--release` does until you pull.** This is the same rule a build follows, and for the same reason: the attachment set is a byte-determining input, so it is adopted at the pull rather than the moment it is edited.
- **A cached plugin whose bytes no longer match the digest the lockfile recorded is refused**, exactly as it would be during a build. Before, `--release` would have run it.

If the Release has no lockfile, `--release` still validates — it warns that it could not check a plugin's identity and names what to run, rather than refusing. See [warnings](../errors/warnings.md).

### Handing back the compiled graph

`--ir-graph` writes the graph this validation resolved to standard output as JSON, ahead of the verdict line. It is additive: the same checks run, the same diagnostics are written, and the exit code is the same as without it. The graph handed back is the one the validation was performed over, so it cannot describe a different resolution than the verdict reports on.

It applies to this scope alone — the whole-catalog and single-entity scopes drive a synthesized harness rather than a Release, and resolve no graph — and asking for it elsewhere is refused rather than silently ignored. If the run stops before the graph is resolved, nothing is written to standard output and the command's own diagnostics say what stopped it.

Note the flag next to it. `--response-format` sets how much of **this command's own report** is written (`detailed` or `concise`); `--ir-graph` asks for a **second document** beside that report. One is volume, the other is subject, and neither moves the verdict.

Values an author declared sensitive are withheld from the graph, in the structured form described at [`aggrega inspect`](aggrega-inspect.md#machine-readable-output). This command carries no affordance for revealing them, so the graph it hands back always withholds; `aggrega inspect <release> --ir-graph --unredacted` is where a pipeline that genuinely needs the values asks for them.

## Single-entity correctness (an entity path)

`aggrega validate <entity-path>` checks one catalog entity file. It applies a tiered set of checks, halting at the first blocking failure so a schema break surfaces loudly before any catalog work:

- **Schema envelope** (every kind) — the exact per-entity JSON-Schema check the catalog loader runs at each parse boundary.
- **Shape** (every kind) — the kind-specific structural validation.
- **Pillar structure** (Component and Feature) — the `spec.schema:` pillar check, using the catalog's SchemaLibraries for cross-document `$ref` expansion.

A **Component or Feature** stops there: schema envelope, shape, and pillar structure. A lone Component has no authored `values` or `infra` to render in isolation, so there is nothing to render — its correctness is fully covered by the schema-and-pillar tiers.

A **Recipe** additionally **renders in isolation**. This is one facet of single-entity correctness, not its headline: after the schema and shape tiers pass, validate resolves the Recipe's `implements` Component from the catalog, synthesizes a minimal deployment around a single instance of that Component bound to the Recipe under test, and drives the real compilation pipeline over it — first resolution and guards (with render skipped), then a real render of the isolated output. Required values are filled with typed placeholders and schema defaults flow through the resolver; the Release routes the instance into a synthesized default boundary and declares no `values:` and no compute the Aggregate did not declare. The rendered artifacts are printed so an author sees the isolated output before wiring the entity into a full Aggregate. Because a single-entity harness fills only required values and supplies no attached credential or topology edge, a Recipe whose template reads a value delivered only by such an input cannot render in isolation; validate reports that the render did not complete and surfaces the underlying render diagnostic, which is a genuine finding tempered by the harness's deliberate minimalism.

A **FeatureRecipe** is schema- and shape-checked; its render is skipped, because a FeatureRecipe renders only when attached to a host component, and synthesizing a guard-passing host for an arbitrary Feature is not attempted.

### What single-entity correctness does not check

One rule of a real deployment is out of reach for a deployment of one, and validate declines it rather than reporting a finding it cannot stand behind: whether the `implements` Component's `required: true` `uses` sockets are populated.

A required socket is populated by wiring an edge to **another** component — from the Aggregate's own `uses` block, or from a Release wiring a socket the Component declares. The synthesized deployment holds a single instance, so it contains no second component for such an edge to target, and no authoring of the synthesized documents can produce one: inventing a peer would mean inventing compute the deployment never declared. Validate therefore names the sockets it did not check and continues through resolution and render:

```
Sockets: required uses sockets not checked (backend, cache, registry)
  Validating a Recipe on its own places its Component in a deployment of one,
  so no other component exists for a required socket to be wired to. Whether
  each of these sockets is populated is checked when the Component is deployed
  in an Aggregate.
```

The line appears only when the Component declares at least one required socket, and it names only the required ones — an optional socket is never listed, because leaving it unwired is not a finding at any scope. A Recipe whose Component declares no required socket produces no such line, and its report is unchanged.

The rule itself is neither relaxed nor duplicated; it is asked at the scope that can answer it. [`aggrega build`](./aggrega-build.md) applies it in full over the Aggregate's and the Release's edge surfaces together, and halts on a required socket nothing wires. So a Recipe that passes single-entity validation still has to satisfy the required-socket rule when its Component is deployed, and the report says so rather than leaving a silent difference between what validate checked and what a build will.

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
| `--ir-graph` | `false` | Also write the IR graph this run computed to stdout, as JSON, in addition to everything this command already produces. Values an author declared sensitive are withheld from it. Applies to the --release scope, the one scope that resolves a Release to a graph. It selects a DOCUMENT, where --response-format sets how much of this command's own report is written; neither affects the verdict or the exit code |
| `--no-unsupported-field-warnings` | `false` | Silence the unsupported-field warning class: the notices a target raises for something you authored that it cannot honor — a Workload field it cannot express (as a lower-fidelity target such as compose does), or an aggrega.ai/ annotation it does not act on for the node's input kind. Other render warnings still surface. Display-only; does not change the rendered output. Applies to the entity scope, the one scope that renders |
| `--plugin` | — | Path to a raw .wasm to validate against its describe() self-report — the pre-publish authoring check. Alone it needs --type; with a Plugin entity argument it cross-checks the binary against the entity's declared type, capability claim, command mirror, and host-function record. |
| `--release` | — | Path to a Release YAML to validate over its resolved dependency closure (mutually exclusive with an entity argument) |
| `--response-format` | `detailed` | Output volume for the --release scope: detailed (default) reports every diagnostic plus advisory lines; concise reports the diagnostic count and the first diagnostic only. The verdict and exit code are identical for both. |
| `--type` | — | Plugin type for a binary-only --plugin check, verified against the binary's self-reported type. Only meaningful with --plugin; when a Plugin entity supplies the type, omit it (a disagreeing value halts). |
<!-- END GENERATED: cli-validate -->
