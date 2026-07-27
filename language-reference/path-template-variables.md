# Path-Template Variables

The `directory:` and `subDirectory:` fields on a Release boundary are Go templates evaluated at build time. They control where rendered artifacts land on disk and, by extension, which artifacts assemble together — two boundaries that evaluate to the same `(path, provider)` tuple share an assembler and produce one merged output (one `Chart.yaml`, one `docker-compose.yaml`). This page is the authoring reference for the variables those templates can reference, the strict evaluation semantics, and the cascade rules that let boundaries inherit from their parents.

For the conceptual treatment of spatial segregation and per-`(path, provider)` dispatch, see [architecture/16-recipe-input-composition.md](../architecture/16-recipe-input-composition.md). For the entity-level Release authoring surface, see [entities/release.md](entities/release.md). The provider-side consequences live in [providers/architecture.md](providers/architecture.md) and the per-provider pages.

## Strict evaluation: `missingkey=error`

Path templates are evaluated with Go's `missingkey=error` mode. A reference to an undeclared field, an unset `parameters.X` key, or a typo such as `{{ .parmaeters.region }}` produces an explicit error rather than silently rendering an empty string into a path.

The strictness is asymmetric with the rest of the compiler — `valuesMapping`, `injectMapping`, and other value-render surfaces use `missingkey=zero` per Helm/Sprig convention. Path emission is structurally different: a value-render template that produces an empty string lands in a manifest field where the consequence is bounded; a path template that produces an empty string lands in a directory layout where the consequence is unbounded (collisions, broken assembly, ghost paths). The strict path-template regime exists to surface those failures at build time rather than at deploy time.

## Parse-time allowlist validation

In addition to runtime strictness, path templates are validated at **parse time** against a closed allowlist of variable names. A reference to a variable name not in the allowlist raises `PATH_TEMPLATE_INVALID_FIELD` before any rendering work begins, with a diagnostic naming the offending field and the boundary it appears on.

The allowlist is closed by design: surfaces such as `.context.inject`, `.values`, and `.locals` are deliberately not exposed to path templates. Path emission is a structural concern, not a value-rendering concern; tying assembly paths to per-component values would make the path graph data-dependent and erode the deterministic-output invariant.

## The variable matrix

| Variable | `directory:` | `subDirectory:` | Description |
| --- | :-: | :-: | --- |
| `{{ .capability }}` | yes | yes | The rendering capability (`helm`, `helm-chart`, `compose`) the contributing component's Recipe declares, for the artifacts emitting at this path. |
| `{{ .boundary_name }}` | yes | yes | The boundary's authored name in the Release (e.g., `production`, `eu-prod`). |
| `{{ .parameters.X }}` | yes | yes | Any typed parameter declared on the Aggregate and fulfilled by the Release. Strict access — referencing `.parameters.unknown` halts the build. |
| `{{ .manifest.recipe_name }}` | yes | yes | The Recipe name resolved through the Manifest for the contributing component. Useful for routing per-Recipe artifacts into per-Recipe sub-folders. |
| `{{ .parent_boundary.* }}` | yes | yes | Cascade access to the enclosing boundary's evaluated values. See [Parent-boundary cascade](#parent-boundary-cascade) below. |
| `{{ .component_id }}` | — | yes | The contributing component's instance ID. Available in `subDirectory:` only because `directory:` is a per-boundary property — the directory string is computed once per boundary, before any per-component routing happens. |

The `directory:` field defaults to the boundary path (a stable build-time identifier derived from the boundary tree). The `subDirectory:` field defaults to `{{ .capability }}` so that each capability's artifacts land in their own sub-folder under the boundary's directory; setting `subDirectory: "."` or `subDirectory: ""` flattens that grouping.

`.capability` is resolved per component, and a boundary's `directory:` is evaluated for two distinct purposes. The per-boundary evaluation that publishes `.parent_boundary.directory` to child boundaries runs before any component is bound, so `.capability` is empty there. The per-component evaluation that fixes where a contributor's artifacts actually land carries that component's capability. A parent authoring `directory: "d-{{ .capability }}"` therefore publishes `d-` down the cascade while its own artifacts land under `d-compose`.

## Parent-boundary cascade

Nested boundaries receive a `.parent_boundary` view exposing the immediate parent boundary's evaluated path and its own cascade-resolved data. The cascade is one level — a boundary's `.parent_boundary` is its direct parent, not the grandparent. To reach further up, the parent boundary itself uses `.parent_boundary` in its own templates, propagating values down the tree explicitly.

Available fields under `.parent_boundary`:

| Field | Description |
| --- | --- |
| `.parent_boundary.directory` | The parent boundary's evaluated `directory:` value (post-template). |
| `.parent_boundary.boundary_name` | The parent boundary's authored name. |
| `.parent_boundary.parameters` | The same `.parameters.*` map the parent boundary saw (parameter values are Release-global, but the alias is provided for symmetry). |
| `.parent_boundary.annotations` | The parent boundary's cascade-resolved annotations. |

The canonical pattern: a parent boundary that authors a `directory:` once, plus child boundaries that route their artifacts under the parent by declaring `directory: "{{ .parent_boundary.directory }}"`. This collapses the children onto the parent's assembly path, producing one merged output that contains contributors from every child. The compose-bridge proof case relies on exactly this: a parent boundary holding the bridge feature, two child boundaries (for example `services-net` and `data-net`) sharing the parent's `directory:`, and one merged `docker-compose.yaml` containing every component plus the bridge service.

The mirror inverts: omit `.parent_boundary.directory` on the children (or evaluate to a distinct path) and each child gets its own assembly. Both shapes are first-class.

## Worked layouts

### Layout 1 — default per-boundary segregation

```yaml
spec:
  boundaries:
    api-prod:
      directory: "deploy/api-prod"
      components:
        api: {}
        cache: {}
    data-prod:
      directory: "deploy/data-prod"
      components:
        db: {}
```

Each boundary evaluates to a distinct `directory:`, so each gets its own assembly:

```text
deploy/api-prod/<capability>/...
deploy/data-prod/<capability>/...
```

The default `subDirectory: "{{ .capability }}"` segregates per-capability artifacts inside each boundary directory. Two boundaries, two assembly outputs per capability, no merging.

### Layout 2 — collapsed assembly via shared parent directory

```yaml
spec:
  boundaries:
    cluster:
      directory: "deploy/cluster"
      annotations:
        aggrega.ai/chart-name: "cluster-umbrella"
      features:
        bridge:
          type: core/compose-bridge:1.0.0
      boundaries:
        services-net:
          directory: "{{ .parent_boundary.directory }}"
          annotations: { aggrega.ai/namespace: services }
          components:
            api: {}
        data-net:
          directory: "{{ .parent_boundary.directory }}"
          annotations: { aggrega.ai/namespace: data }
          components:
            db: {}
```

Both child boundaries evaluate `directory:` to `deploy/cluster` (the parent's directory), so all contributors merge at one assembly path. With the default `subDirectory: "{{ .capability }}"`, the compose contributors from both children land in `deploy/cluster/compose/` and produce one merged `docker-compose.yaml`. The `compose-bridge` Feature attached at the parent runs once (boundary-scope dispatch) and contributes the bridge service to the same merged file.

The parent's `aggrega.ai/chart-name: "cluster-umbrella"` annotation cascades to both children; if the boundaries also held helm-chart contributors, both children's helm-chart sub-charts would compose under one umbrella named `cluster-umbrella`. Mismatched chart-name values across contributors at one path raise `CHART_NAME_MISMATCH`.

### Layout 3 — per-component routing via `subDirectory:` plus parameters

```yaml
spec:
  parameters:
    region: "eu-west-1"
  boundaries:
    eu-prod:
      directory: "deploy/{{ .parameters.region }}"
      components:
        api:
          subDirectory: "{{ .capability }}/{{ .component_id }}"
        db:
          subDirectory: "{{ .capability }}/{{ .component_id }}"
        ingress:
          subDirectory: "shared"
```

The boundary's `directory:` evaluates to `deploy/eu-west-1` (parameter substitution). Per-component `subDirectory:` overrides route each contributor to a per-component sub-folder, with the `ingress` component overriding to a flat `shared` sub-folder for cross-cutting artifacts:

```text
deploy/eu-west-1/<capability>/api/...
deploy/eu-west-1/<capability>/db/...
deploy/eu-west-1/shared/...
```

This pattern fits enterprises that want per-component artifact directories for downstream tooling that operates on a single component's manifests.

## Diagnostics

The path-template surface produces five distinct fatal halts, each documented in [errors/fatal-halts.md](errors/fatal-halts.md):

- **`PATH_TEMPLATE_INVALID_FIELD`** — parse-time: a path template references a variable not in the allowlist.
- **`PATH_COLLISION`** — assembly-time: two boundary contributors evaluate to the same path but disagree on a property that must be uniform across contributors at that path.
- **`INSTANCE_ID_COLLISION`** — assembly-time: two boundaries that evaluate to the same `(path, provider)` tuple contribute components with identical instance IDs.
- **`CHART_NAME_MISMATCH`** — assembly-time: a merged helm-chart assembly receives contributors with conflicting cascade-resolved `aggrega.ai/chart-name` annotations.
- Generic missing-key: a path template references a field under an **open** variable that resolves to no value (e.g., `{{ .parameters.region }}` when the Release omits `region`, or a `.parent_boundary` key at a top-level boundary that has no parent); `missingkey=error` produces an explicit message naming the boundary, the template field (`directory:` vs `subDirectory:`), and the missing key. `.parameters` and `.parent_boundary` are open — their keys are authored data — while `.manifest` declares its keys, so a mistyped key under `.manifest` is refused at parse time as an unknown reference instead, with the diagnostic listing the keys `.manifest` defines.

## Cross-references

- [`entities/release.md`](entities/release.md) — Release authoring, including spatial segregation and the `directory:` / `subDirectory:` fields.
- [`providers/architecture.md`](providers/architecture.md) — provider dispatch and the per-`(path, provider)` assembly model.
- [`providers/compose.md`](providers/compose.md) — compose-side per-`(path, provider)` output, including the merged-path scenario.
- [`providers/helm-chart.md`](providers/helm-chart.md) — helm-chart umbrella composition and the chart-name cascade rule for merged paths.
- [`entities/featurerecipe.md`](entities/featurerecipe.md) — boundary-scope FeatureRecipes (the compose-bridge proof case relies on the merged-path assembly model documented here).
- [`errors/fatal-halts.md`](errors/fatal-halts.md) — full diagnostic catalogue including the five path-dispatch errors enumerated above.
