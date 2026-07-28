# aggrega build

`aggrega build` compiles an Aggregate + Release pair into provider-native artifacts (Helm manifests, redistributable Helm charts, docker-compose YAML) under the configured output directory.

## Synopsis

```
aggrega build --release <path> [--catalog <dir>]... [--trace [--trace-unredacted]] [--detail] [other flags]
```

## Required flags

- `--release <path>` — path to the Release YAML. The Release is the single entry point: it names the Aggregate and Manifest, declares boundaries, and routes components to providers. The Release's schema-required `manifest:` reference is resolved relative to the Release file.

## Common flags

- `--catalog <dir>` — a directory containing catalog entities (Components, Features, Recipes, FeatureRecipes, Providers), loaded recursively. **Repeatable**, and **prepended** to the workspace's `catalog_dirs`: the resulting list is an ordered first-win search stack, so an earlier directory (each `--catalog` dir, then the configured directories in order) wins an entity identity and a later directory's copy is shadowed. Build honors `catalog_dirs` from `.aggrega-config.yaml` even when no `--catalog` is given. With neither set, the search defaults to the current working directory. To search a project-local catalog alongside a shared one, pass both (`--catalog ./catalog --catalog ../shared-catalog`) or list them under `catalog_dirs`. With `--detail`, any entity a higher-precedence directory shadows is reported.
- `--trace` — write per-pass intermediate state to `.trace/` (sibling to `dist/`) for post-mortem inspection. See [Trace output](#trace-output) below.
- `--trace-unredacted` — write the declared-sensitive values into those files instead of the text that stands in for them, and mark every file it writes with a header saying so. It requires `--trace`; on its own the build halts rather than doing nothing. See [Showing the withheld values](#showing-the-withheld-values) below.
- `--detail` — when build performs the implicit auto-pull (no lockfile present and `auto_pull` enabled), print per resolved entity what that pull did: fetched fresh from a registry, reused a cache slot, found in a local catalog, or external. This is the same transient pull-event diagnostic that [`aggrega pull --detail`](aggrega-pull.md) emits, written to stdout and never persisted to the lockfile. When a lockfile already exists, build does not pull, so there is nothing to report: the flag prints a one-line note to stderr and proceeds — it never fabricates a resolution tier the committed lockfile does not carry. For the post-pull resolution *state* of a Release's dependencies, use [`aggrega inspect`](aggrega-inspect.md).

## Workspace resolution and determinism

A relative `catalog_dirs` entry (and a relative filesystem plugin path) resolves
against the directory of the `.aggrega-config.yaml` that declared it — "relative"
always means relative to the file you wrote it in, so a path means the same
thing wherever you invoke `aggrega` from. A `--catalog` flag, which has no
declaring file, resolves against the current working directory. Registry
references (`oci://…`, a hub reference) are left as-is.

The workspace root is the directory of the nearest ancestor `.aggrega-config.yaml`
carrying a `workspace:` block, or the directory `--workspace-root` names. When the
root is pinned this way, a build is **invocation-location-independent**: running
`aggrega build` from the project root and from a subdirectory produces
byte-identical IR and rendered artifacts, because the catalog searched and the
source paths recorded in the output do not shift with the working directory. (With
no `workspace:` marker and no `--workspace-root`, the working directory is the
root, so output is anchored there instead.)

## Environment variables

The workspace settings build reads can be overridden through the environment, above the committed config and below any flag: `AGGREGA_OFFLINE`, `AGGREGA_AUTO_PULL`, `AGGREGA_CATALOG_DIRS` (OS-path-list separated; supply absolute paths), `AGGREGA_ARTIFACT_CACHE_DIR`, `AGGREGA_DEFAULT_REGISTRY`, and `AGGREGA_WORKSPACE_ROOT`. See [environment-variables.md](environment-variables.md) for the full list and the precedence model.

## Output

Rendered artifacts land under `dist/`. The default output structure is per-boundary, per-provider: `dist/<boundary-path>/<provider>/<files>`. Operator-authored `directory:` and `subDirectory:` overrides on Release boundaries change the target path; per-`(path, provider)` collapse merges contributors that resolve to the same evaluated path.

### YAML indentation

Every rendered YAML artifact — docker-compose files, Helm chart templates and values, and Kubernetes manifests — is emitted at a uniform indentation width. The width is set by `build.yaml_indent` in `.aggrega-config.yaml` and defaults to **2** (the conventional width for those formats):

```yaml
build:
  yaml_indent: 2   # default; accepts 2 through 9
```

The width is applied at a single marshal point shared by every renderer, so output stays byte-identical across runs of the same input. Values outside the `[2, 9]` range are rejected by config-schema validation.

## Trace output

The `--trace` flag turns on a per-node debug dump capturing every intermediate compiler state. Output lives at `.trace/` next to `dist/` (never under it; the sibling layout follows the convention of `.git/`, `.terraform/`, `node_modules/` and keeps `dist/` purely deployable).

The directory layout is per-boundary, per-instance:

```
.trace/
└── boundaries/
    └── <boundary-path>/
        └── <instance-id>/
            ├── 01-pillars-initial.yaml
            ├── 02-pass1-provides.yaml
            ├── 03-pass2-inject.yaml
            ├── 04-phaseA-inject.yaml
            ├── 05-phaseB-source.yaml
            ├── 06-phaseB-locals.yaml
            ├── 07-phaseB-valuesMapping.yaml
            ├── 08-phaseB-workload.yaml
            ├── 09-phaseB-artifacts/
            │   └── <per-artifact-file>.yaml
            ├── 10-engine-synthesis/
            │   └── <per-synthesised-file>.yaml
            ├── 11-engine-emission.log
            └── 12-labels-injected.log
```

Each slot captures a specific compiler state:

- `01-pillars-initial.yaml` — the per-node `TemplateContext` snapshot after Step 1 resolution and before any per-pass mutation. Carries `.values`, `.infra`, `.context`, `.parameters`, `.metadata`.
- `02-pass1-provides.yaml` — the resolved `provides:` outputs after Pass 1.
- `03-pass2-inject.yaml` — the merged `.context.inject` pipe after Pass 2 resolution (consumer-side view of upstream `provides`).
- `04-phaseA-inject.yaml` — the `.context.inject` pipe after Phase A FeatureRecipe `injectMapping` rewrites.
- `05-phaseB-source.yaml` — the parsed `source:` content the provider engine will consume. Present only when the Recipe declares `source:`.
- `06-phaseB-locals.yaml` — the resolved `locals:` block.
- `07-phaseB-valuesMapping.yaml` — the rendered `valuesMapping:` output (the dictionary the provider engine receives). Present only when the Recipe declares `valuesMapping:`.
- `08-phaseB-workload.yaml` — the parsed `Workload` document. Present only when the Recipe declares `workload:` (inline or `$import:`-loaded).
- `09-phaseB-artifacts/` — one file per evaluated artifact. Present only when the Recipe declares `artifacts:` (with entries inline or per-entry `$import:`-loaded).
- `10-engine-synthesis/` — one file per synthesised manifest the provider engine produced from the Workload (helm/compose workload-mode). Present only when the engine ran a synthesis path.
- `11-engine-emission.log` — the post-emission summary (file count, output paths) for the node.
- `12-labels-injected.log` — the provenance labels and annotations written onto rendered output for the node.

The trace writer is non-blocking: events go through a bounded channel and a dedicated goroutine drains to disk. Compile latency is unaffected by trace I/O — the same compile finishes in the same wall-clock time whether `--trace` is on or off.

### Declared-sensitive values in the trace

A datum an author declared sensitive — a schema leaf carrying `sensitive: true`, or a delivery key whose material came from a `provides` key that does — is written to the trace as the fixed text `<redacted>`. The key is kept and only the value is replaced, so a slot still shows which leaves and which delivery keys a node carries. An undeclared sibling in the same block prints its value verbatim; the substitution follows the declaration and nothing else.

A value a template computed from a declared-sensitive datum is withheld too, even though its own key carries no declaration. What identifies it is the reference the author wrote: a `locals:` entry whose template reads a declared-sensitive leaf is withheld, and so is a `source:` field that does. The reading is conservative — a template that reaches a whole object reaches every declared leaf under it, so `{{ range $k, $v := .values.creds }}` withholds its output when anything under `creds` is declared — and a `locals:` entry that reads an already-withheld sibling is withheld in turn. A sibling entry of the same shape that reads nothing declared prints verbatim.

Three limits are worth reading before treating `.trace/` as safe:

- **`dist/` is not redacted.** Rendered artifacts are emitted exactly as the render produced them, because they are the deployable. Only `.trace/` is affected, and only where a datum is identifiable by key or by the reference a template made to one.
- **A value interpolated into a rendered document stays in the clear.** The parsed `Workload` a slot carries from the artifact and synthesis passes onward is a document the Recipe's template produced, and nothing in it records which declaration a given character came from — so a value inside it is not identifiable by key for substitution the way a pillar leaf or a `locals:` entry is.
- **A view of another node is withheld against that node's declarations, not this one's.** The uses-edge view and the boundary view a slot carries reproduce what a neighbouring node published, and the substitution a slot applies is driven by the declarations of the node the slot belongs to.

Treat `.trace/` as carrying material and handle it the way `dist/` is handled.

### Showing the withheld values

`--trace-unredacted`, alongside `--trace`, writes the declared-sensitive values into the trace files instead of the text that stands in for them. It exists because the withheld value is sometimes the one being debugged — a credential arriving from the wrong attachment looks identical to the right one when both read as withheld.

Three properties bound it:

- **Every file it writes says what it is.** Each trace file the run produces opens with a comment naming the flag and stating that declared-sensitive values appear below in the clear, so a file later attached to a bug report or left in a shared directory carries its own warning. The comment is valid in the file's own format, so the file still parses.
- **It reaches `.trace/` and nothing else.** Rendered artifacts are byte-identical with and without it — it changes what a debug file shows, never what a build produces — and the `aggrega inspect` layouts and the diagnostic text a failed build prints are identical in both states.
- **It lives on the invocation only.** There is no configuration setting for it, so it cannot be turned on once and left on for everyone who builds the workspace afterwards. Requesting it without `--trace` halts the build with a message naming both flags, rather than accepting a request it cannot honour.

Separately from the trace, a build prints one advisory per delivery key that carries declared-sensitive material as a literal value, naming the component, the target, the attachment and the delivery key. It never halts the build and `--no-unsupported-field-warnings` does not silence it — that flag covers a target's fidelity notices, a different class.

The keyword, its two authoring sites, the advisory's exact wording and the full ceiling on what declaring it achieves are at [`vocabulary/compact-form-authoring.md`](../vocabulary/compact-form-authoring.md) "Declaring a leaf sensitive".

## When to use `--trace`

- Diagnosing why a rendered manifest doesn't carry an expected value: walk the per-pass dumps to find the first slot where the value is missing.
- Verifying determinism after a compiler upgrade: two compiles of the same input with `--trace` produce byte-identical trace dumps; any per-slot diff localises the regression.
- Catalog authoring iteration: comparing the `04-phaseA-inject.yaml` and `06-phaseB-locals.yaml` snapshots shows what the Recipe's templates see at evaluation time.

## Examples

Compile a Release against the local catalog:

```
aggrega build --release releases/production.yaml
```

Compile with a separate catalog directory:

```
aggrega build --release releases/production.yaml --catalog ../platform-catalog/
```

Compile with trace dumps for debugging:

```
aggrega build --release releases/production.yaml --trace
```

After the compile, inspect `.trace/boundaries/<boundary>/<instance>/` for per-pass state. The `.trace/` directory is overwritten on each `--trace` run; previous trace state is not preserved across compiles.

## Cross-references

- [`aggrega-pull`](aggrega-pull.md) — fetch catalog entities from an OCI registry into the local catalog.
- [`aggrega-validate`](aggrega-validate.md) — check catalog, Release-closure, or single-entity correctness without emitting artifacts; the dependency validation a build runs, without the render.
- [`aggrega-lint`](aggrega-lint.md) — check catalog publishing conventions across the same three scopes.
- [`aggrega-inspect`](aggrega-inspect.md) — query the IR graph after Step 3 without proceeding to render.
- [Errors](../errors/error-translation.md) — the categorized error rendering format that surfaces at the CLI.

<!-- BEGIN GENERATED: cli-build -->
**Synopsis**

```
aggrega build [flags]
```

**Flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--auto-pull` | `false` | Run the pull step before building: resolve the Release's dependencies into the lockfile and cache in-process, then build against them. This is the same in-process fill the workspace auto_pull setting performs, turned on for a single build without editing workspace config. On its own it is an incremental fill — existing pins are honored, and references with no pin are resolved and added |
| `--catalog` | `[]` | Catalog directory; repeatable. Each --catalog is prepended to the workspace catalog_dirs search stack (first match wins). Defaults to the current directory. |
| `--debug` | `false` | Emit human-readable verbose diagnostics on stderr — per-phase wall-clock timing and entity/dependency counts. Wins over --quiet: verbose output always emits. Distinct from --trace, which writes machine-readable per-node intermediate files to .trace/ |
| `--detail` | `false` | Build is read-only by default and prints no resolution detail. When workspace auto_pull is enabled and no lockfile is present, build fills the lockfile in-process; this flag then prints per resolved entity what that fill did — fetched fresh from a registry, reused a cache slot, found in a local catalog, or external. Stdout only; not persisted. No-op when a lockfile already exists (no fill this build) |
| `--disable-plugin-cache` | `false` | Skip the persistent on-disk plugin compile cache for this build and compile plugin guests fresh in an in-memory cache that is discarded when the build ends. Off by default, which reuses the shared on-disk cache across builds. Does not change rendered output |
| `--no-acquire-inputs` | `false` | Freeze the external-input set: a render that requests an unpinned external URL halts with a diagnostic instead of fetching and pinning it. Pinned inputs are still served from the content-addressed store (and refilled by digest when the blob is missing) |
| `--no-unsupported-field-warnings` | `false` | Silence the unsupported-field warning class: the per-field notices a lower-fidelity target (such as compose) emits for authored Workload fields it cannot honor. Other render warnings still surface. Display-only; does not change the rendered output |
| `--progress` | `false` | Force the build-progress surface on even when stderr is not a terminal, printing plain static phase lines. The default is auto: the interactive phase checklist is shown only when stderr is a terminal. --quiet and --debug both override --progress |
| `--quiet` | `false` | Silence the build-progress surface on stderr. Does not affect stdout. Takes precedence over --progress |
| `--release` | — | Path to Release YAML file (required) |
| `--trace` | `false` | write per-node intermediate files to .trace/ (sibling to dist/) for post-mortem inspection |
| `--trace-unredacted` | `false` | Write the declared-sensitive values into the .trace/ files instead of the <redacted> text that stands in for them, and stamp every file the trace writes with a header saying so. Requires --trace. It reaches .trace/ and nothing else: rendered artifacts, `aggrega inspect` output and diagnostic text are identical with and without it. Invocation-only — there is no workspace-config setting for it, so it can never be left on for a later build |
| `--upgrade` | `false` | Make the auto-pull step a full refresh: discard the existing lockfile and re-resolve every dependency from current registry state, floating each to the highest available version instead of honoring existing pins. Implies --auto-pull — on its own it runs a full-refresh pull before the build |
| `--verify-determinism` | `false` | Render every node twice and compare the emitted bytes, halting the build if any node's two renders differ. Off by default. Use it to confirm a provider renders deterministically — identical input yields byte-identical output — which the GitOps-diff and byte-identical-output guarantees rely on |
<!-- END GENERATED: cli-build -->
