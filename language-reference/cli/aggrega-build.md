# aggrega build

`aggrega build` compiles an Aggregate + Release pair into provider-native artifacts (Helm manifests, docker-compose YAML, Terraform plans, CloudFormation templates) under the configured output directory.

## Synopsis

```
aggrega build --release <path> [--catalog <dir>] [--trace] [other flags]
```

## Required flags

- `--release <path>` — path to the Release YAML. The Release is the single entry point: it names the Aggregate and Manifest, declares boundaries, and routes components to providers. The Release's schema-required `manifest:` reference is resolved relative to the Release file.

## Common flags

- `--catalog <dir>` — directory containing catalog entities (Components, Features, Recipes, FeatureRecipes, Providers). Defaults to the current working directory. Catalog entities are loaded recursively under this path.
- `--trace` — write per-pass intermediate state to `.trace/` (sibling to `dist/`) for post-mortem inspection. See [Trace output](#trace-output) below.

## Output

Rendered artifacts land under `dist/`. The default output structure is per-boundary, per-provider: `dist/<boundary-path>/<provider>/<files>`. Operator-authored `directory:` and `subDirectory:` overrides on Release boundaries change the target path; per-`(path, provider)` collapse merges contributors that resolve to the same evaluated path.

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
