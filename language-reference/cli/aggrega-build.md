# aggrega build

`aggrega build` compiles an Aggregate + Release pair into provider-native artifacts (Helm manifests, redistributable Helm charts, docker-compose YAML) under the configured output directory.

## Synopsis

```
aggrega build --release <path> [--catalog <dir>]... [--trace] [--detail] [other flags]
```

## Required flags

- `--release <path>` — path to the Release YAML. The Release is the single entry point: it names the Aggregate and Manifest, declares boundaries, and routes components to providers. The Release's schema-required `manifest:` reference is resolved relative to the Release file.

## Common flags

- `--catalog <dir>` — a directory containing catalog entities (Components, Features, Recipes, FeatureRecipes, Providers), loaded recursively. **Repeatable**, and **prepended** to the workspace's `catalog_dirs`: the resulting list is an ordered first-win search stack, so an earlier directory (each `--catalog` dir, then the configured directories in order) wins an entity identity and a later directory's copy is shadowed. Build honors `catalog_dirs` from `.aggrega-config.yaml` even when no `--catalog` is given. With neither set, the search defaults to the current working directory. To search a project-local catalog alongside a shared one, pass both (`--catalog ./catalog --catalog ../shared-catalog`) or list them under `catalog_dirs`. With `--detail`, any entity a higher-precedence directory shadows is reported.
- `--trace` — write per-pass intermediate state to `.trace/` (sibling to `dist/`) for post-mortem inspection. See [Trace output](#trace-output) below.
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
- [`aggrega-lint`](aggrega-lint.md) — validate catalog entities and Aggregates without rendering.
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
| `--catalog` | `[]` | Catalog directory; repeatable. Each --catalog is prepended to the workspace catalog_dirs search stack (first match wins). Defaults to the current directory. |
| `--debug` | `false` | Emit human-readable verbose diagnostics on stderr — per-phase wall-clock timing and entity/dependency counts. Wins over --quiet: verbose output always emits. Distinct from --trace, which writes machine-readable per-node intermediate files to .trace/ |
| `--detail` | `false` | When build performs the implicit auto-pull (no lockfile present, auto_pull enabled), print per resolved entity what that pull did — fetched fresh from a registry, reused a cache slot, found in a local catalog, or external. Stdout only; not persisted. No-op when a lockfile already exists (no pull this build) |
| `--disable-plugin-cache` | `false` | Skip the persistent on-disk plugin compile cache for this build and compile plugin guests fresh in an in-memory cache that is discarded when the build ends. Off by default, which reuses the shared on-disk cache across builds. Does not change rendered output |
| `--no-acquire-inputs` | `false` | Freeze the external-input set: a render that requests an unpinned external URL halts with a diagnostic instead of fetching and pinning it. Pinned inputs are still served from the content-addressed store (and refilled by digest when the blob is missing) |
| `--progress` | `false` | Force the build-progress surface on even when stderr is not a terminal, printing plain static phase lines. The default is auto: the interactive phase checklist is shown only when stderr is a terminal. --quiet and --debug both override --progress |
| `--quiet` | `false` | Silence the build-progress surface on stderr. Does not affect stdout. Takes precedence over --progress |
| `--release` | — | Path to Release YAML file (required) |
| `--trace` | `false` | write per-node intermediate files to .trace/ (sibling to dist/) for post-mortem inspection |
| `--verify-determinism` | `false` | Render every node twice and compare the emitted bytes, halting the build if any node's two renders differ. Off by default. Use it to confirm a provider renders deterministically — identical input yields byte-identical output — which the GitOps-diff and byte-identical-output guarantees rely on |
<!-- END GENERATED: cli-build -->
