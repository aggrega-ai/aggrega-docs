# extends and implements

## Inheritance via `extends`

Catalog entities (`Component`, `Feature`) support Single Inheritance via the `extends` keyword, which lets Platform Architects build specialized entities on top of a shared base. The **YAML envelope deep-merge** is common to both kinds: metadata, labels, and the declarative structural tables on the extending entity overwrite matching keys in the base, and nested maps recurse. The two kinds part company on the **data pillars**.

**This page covers the catalog kinds, and they are not the only kinds that declare `extends`.** A Release and a Manifest declare it too, and both are deployment-side documents authored beside each other rather than catalog-indexed entities — so their references name files, not catalog entities, and what folds is an authoring surface rather than a schema. For those, see [`entities/release.md`](../entities/release.md#composite-release-and-extends-inheritance) and [`entities/manifest.md`](../entities/manifest.md).

### A Component's `extends` composes structure and inherits the pillars whole

For a Component, `extends` composes `metadata.labels`, `metadata.annotations`, `spec.featuresSchema` (attachment slots), `spec.usesSchema` (topology sockets) and `spec.inject` (the self-inject allowlist, whose entries concatenate base-first without duplicates). The three data pillars — `values`, `infra`, `provides` — are not composed. An extending Component authors no pillar content: it writes the literal marker `schema: inherited` and receives the base's `schema:` block exactly as the base authored it, at every depth of a chain.

The published Component schema makes that marker both mandatory and exclusive, and rejects each departure from it when the document loads, with its own diagnostic for each: pillar content authored under `schema:` on a Component that declares `extends:`; `schema:` omitted there entirely; and `schema: inherited` on a Component that declares no `extends:`.

Two consequences follow, and they pull in opposite directions:

* **The key set is fixed by the base.** An extending Component declares no pillar keys, so it cannot hide, drop, or retype one the base declares, and adds none of its own. An instance of the base and an instance of anything extending it are validated against the same pillar contract.
* **Tightening moves to `assertions:`.** A specialization that must admit less than the inherited pillars do says so as a predicate on itself, not as a narrowed schema leaf. If a base `core/base-server` declares `tls_enabled: { type: boolean, default: true }`, a specialization that requires TLS unconditionally writes:

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: core/tls-only-server
  version: 1.0.0
  labels:
    component.aggrega.ai/type: "server"
spec:
  extends: core/base-server
  schema: inherited          # values, infra and provides are the base's, verbatim
  assertions:
    tls-is-mandatory: |
      {{- if not .values.tls_enabled -}}
        {{- fail "this component requires tls_enabled: true" -}}
      {{- end -}}
```

The rule rejects a value the inherited pillar block accepts, which is exactly what tightening means here. The reverse direction has no expression at all: a specialization cannot loosen an inherited constraint, because it cannot restate the leaf that carries it. See [`entities/component.md`](../entities/component.md) "Catalog Authoring: Extending Base Components" for the full composition table and the worked base-and-extension pair.

### A Feature's `extends` composes its pillars

For a Feature, the child's `schema:` composes with the base's under JSON Schema 2020-12 composition semantics, producing a single merged schema that an authored instance validates against. Credential Features — those labeled `feature.aggrega.ai/kind: secret` — use this to build on a shared base: a child credential Feature extends a parent to inherit its vault query schema while narrowing constraints.

The compiler takes no position on the direction of that change. Composition is structural, so a child constraint that widens the base's composes without halting the build and surfaces as an advisory. Nothing rejects it: a Feature base's constraint is a shared expectation the catalog's authors uphold by review, not a contract the platform polices.

## Interface Binding via `implements`

Recipes and FeatureRecipes bind to a Component or Feature interface via the `implements:` keyword at the top of their `spec`. The binding declares which catalog interface this Recipe / FeatureRecipe is the concrete implementation of, and supports three forms of version matching:

- **Exact** — `implements: core/api-server:1.0.0` — matches one specific version of the Component type.
- **Major-compatible range** — `implements: core/api-server:^1.0.0` — matches any version satisfying `>=1.0.0, <2.0.0` (SemVer major-compatible). Used when a Recipe supports a compatible range rather than a single pinned version.
- **Unversioned** — `implements: core/api-server` — matches any version of the Component type. Used when a Recipe serves every version of the type.

`implements:` never selects a Recipe: the Manifest's mapping does. What the declaration drives is the consistency check on each mapping entry — the mapped type's version must satisfy the mapped Recipe's `implements:` in one of the three forms, or the Recipe must implement a base that type extends — and the candidate list the no-mapping diagnostic and editor completion offer. A mapping entry whose Recipe's `implements:` matches neither the mapped type nor any of its bases halts the build, naming the mapping, the Recipe and its `implements:` value.

The `implements:` binding is the mechanism that makes "the same Component type, different Recipes for different providers" work: a `core/postgres` Component can have one Recipe implementing it for the `helm` provider and a different Recipe implementing it for the `compose` provider. Each Recipe declares the same `implements:` value, and the Manifest a Release builds with maps the type to the one it wants.

### A Recipe written against a base serves everything that extends it

`implements:` names a base, and a Recipe that names one is the concrete implementation for every Component extending that base, at any depth of the chain. So a specialization built with `extends` needs no Recipe of its own — which is what makes a published wrapper cheap to consume: the team that publishes it authors a Component, and the teams that deploy it reuse the base's Recipes on every target.

Two facts hold at once here, and they are separate. A reader who collapses them into "the specialization needs nothing" writes a Manifest that fails, for a reason they will look for in the wrong file:

* **The Recipe matches.** The consistency check between a Manifest mapping's type key and the mapped Recipe's `implements:` accepts the mapping when the Recipe implements the mapped type itself **or** any base that type extends. The three version forms above apply to a base exactly as they apply to the type itself: a Recipe declaring `implements: core/base-server:^1.0.0` satisfies a specialization whose base is version `1.4.0`, and does not satisfy one whose base is `2.0.0`.
* **The Manifest still maps the specialization's own type.** Recipe selection is by exact mapping key. An instance of `enterprise/labelled-server` needs its own `mappings.components.type` entry; it does not inherit the entry written for `core/base-server`. A specialization with no entry of its own halts with the unmapped-instance diagnostic even when its base is mapped.

The authoring cost of a specialization is therefore one Manifest line and no new Recipe:

```yaml
# The wrapper extends core/base-server and authors no pillars.
# core/helm/base-server declares: implements: core/base-server
spec:
  mappings:
    components:
      type:
        enterprise/labelled-server:1.0.0: core/helm/base-server:1.0.0
```

When the mapped type's `extends` chain cannot be walked — it forms a loop, or a base it names is absent from the catalog — the build halts on that chain fault instead of on the mapping, because a mapping cannot be judged until the chain it depends on resolves. The check walks the chain only through the Components already on this machine — those in a catalog directory, and those the local artifact cache holds under a lockfile pin — and never asks a registry, so a base held only by a registry counts as absent here.

Recipe **suggestions** stay narrower than this matching rule. The candidate list a no-mapping diagnostic prints, and the ordering editor completion applies to a mapping value, name the recipes implementing the requested type itself; they do not widen to recipes implementing one of its bases.

For a runnable end-to-end walkthrough — a published wrapper in the catalog, the one Manifest line that consumes it, the base's Recipe shaping its rendered output, and the halt a wrapper instance with no mapping of its own produces — see the worked example [`examples/extends-wrapper/`](../examples/extends-wrapper/README.md).

## Cross-entity version consumption

The 'Resolution precedence' framing in the section above describes the design target; the table below describes what the resolver matches against today.

Every Aggrega entity kind — Component, Feature, Aggregate, Recipe, FeatureRecipe, Manifest, Release, Plugin, SchemaLibrary, MappingLibrary, WorkloadLibrary, ArtifactLibrary — carries a required `metadata.version` field validated against the same SemVer regex (`MAJOR.MINOR.PATCH` per [`architecture/02-ecosystem-philosophy.md`](../../architecture/02-ecosystem-philosophy.md)). Versions are uniform in *shape*; the *consumption* of versions varies per entity kind. Some versions actively participate in resolution; others are descriptive provenance the compiler does not match against. The table below covers the non-library kinds, naming what the compiler does with each entity's version field today and using the four-label status taxonomy from [`10-status.md`](../10-status.md) to classify each consumption regime. The four library kinds are outside the table because their regime is uniform and different: a consumer references a library by bare name, may assert an optional `:<version>` minimum-version floor, and the per-Release lockfile owns the resolved version and its content digest.

| Entity | Consumption regime | Status today |
| --- | --- | --- |
| Component | Type-reference resolution; Recipe `implements:` matching | `available` — exact, caret-range (`^MAJOR.MINOR.PATCH`), and unversioned forms in both (see [Version resolution](../version-resolution.md) and [Status → Version matching](../10-status.md#version-matching)) |
| Feature | Attachment-reference resolution; FeatureRecipe `implements:` matching | Same as Component |
| Recipe | Manifest mapping tier resolution | `available` — exact, caret-range and unversioned forms in a mapping value, each selecting the highest satisfying version |
| FeatureRecipe | Manifest mapping tier resolution | Same as Recipe |
| Aggregate | Parent `aggregates[].type` reference resolution | `available` — exact, caret-range, and unversioned forms, each selecting the highest satisfying version (see [Version resolution](../version-resolution.md)) |
| Plugin | Provider dispatch via `recipe.spec.capability` → `spec.provider.capabilities` | `available` — the bare capability selects the provider, and a pin on it (`helm:<version>`, `helm:^<version>`) selects which version of that plugin renders; the plugin's identity is the digest-free `oci://<repository>` reference plus `metadata.version`, and the content digest is recorded in the release lockfile the build verifies fetched bytes against |
| Manifest | IR graph provenance (`manifest_version`) | `available` (read only for provenance; no role in resolution dispatch) |
| Release | IR graph provenance (`release_version`) + template metadata (`.metadata.release_version`) | Same as Manifest |

**Catalog-resolution regimes (Component, Feature, Aggregate, Plugin).** A reference to one of these kinds — a component's `type`, a feature attachment's `type`, a sub-aggregate import's `aggregates[].type`, a pipeline step's `plugin` — resolves by the rule [Version resolution](../version-resolution.md) teaches: an exact, caret-range or unversioned reference selects the highest satisfying version among those the catalog holds, and the pull, the build, a validate, the editor and the assistant-facing tools apply that one rule alike. For a Component or Feature, `implements:` matching reads the same three forms from the other direction — a concrete type version against the form a Recipe or FeatureRecipe declares — as the consistency check described below, not as a selection. Provider-rendering-plugin dispatch uses a simpler shape today: it looks up the bare `recipe.spec.capability` against the provider-rendering plugin's `spec.provider.capabilities` by name, and a version pin written on the capability selects which version of that plugin renders, halting when no version satisfies it.

**Manifest mapping tier resolution.** The Manifest's flat `mappings.{components,features}` resolution mechanism (with `name` and `type` tiers, name-wins-over-type, and versioned-type wins over unversioned-type) is documented at [`entities/manifest.md`](../entities/manifest.md). The resolver consumes those mappings: Recipe and FeatureRecipe selection is a direct lookup of the mapping value against the lockfile and catalog, and a component or attachment whose type carries no mapping halts the build. `spec.implements` does not select a Recipe — it is the load-time consistency check on a mapping the author already wrote, and the source of the candidate list the no-mapping diagnostic and editor completion offer. Capability dispatch then flows from the resolved Recipe's `spec.capability` field, not from the Manifest's structural shape.

**Descriptive-provenance regimes (Manifest, Release).** Manifest `metadata.version` and Release `metadata.version` are read when the compiler populates provenance, and appear in the IR graph's provenance block as `manifest_version` and `release_version`; no label on rendered output carries either. Templates also see Release version exposed as `.metadata.release_version`. Neither version is matched against any other entity's version for resolution dispatch; these are pure provenance.

**Reading the table.** The four-label classification distinguishes "the version field is accepted by the schema and exists on the entity" (always true — uniform SemVer regex) from "the compiler matches against this version during resolution" (varies per entity). When the precedence-iteration extension and Manifest mapping tier consumption ship in their respective future releases, this table's labels update to `available` accordingly; until then, the table reflects what the resolver does today rather than what the architectural design promises.

## Schema-bridge cross-pillar piping: Bridging Intent to Infrastructure

Aggrega expresses a strong Separation of Concerns between Domain 1 and Domain 4: the Developer writes cognitive logic in the `values` block, while the Operator dictates physical sizing in the `infra` block. The `Aggregate.yaml` schema enforces one concrete corollary: the `infra` keyword is absent from the Aggregate's component instances and from their `features` attachments and, combined with `additionalProperties: false`, is rejected by schema validation. Developers should not dictate physical sizing inside Developer Intent; when a specific value fits the application's case (e.g., a hardcoded port or a specific CPU number), the Architect may expose it explicitly in the Component's `schema:` declaration and the value flows through `values`.

For cases where a specific infrastructure constraint is an intrinsic part of a component's contract — a high-throughput trading database that must have 10,000 provisioned IOPS, an ML workload that must run on exactly 4 GPUs — Platform Architects expose the constraint through a purpose-built Component using the **schema-bridge cross-pillar piping** pattern.

**The schema-bridge pattern for infrastructure-aware components.**
The Component exposes the specific infrastructure dial inside the developer's `values` block through its `schema:` declaration, and the bound Recipe's `valuesMapping:` template pipes the value into the rendered `infra:`-shaped output. The result is a typed bridge between cognitive intent and physical sizing: the developer dictates the hardware constraint through a validated field, and the constraint flows to Ops without either side writing raw infrastructure code. The dial is a pillar key, so it is declared on the Component whose contract owns it — a Component that `extends:` a base declares no pillar keys and therefore cannot introduce one.

```yaml
# Domain 2: The Platform Catalog (the schema-bridge Component)
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: core/high-perf-postgres
  version: 1.0.0
  labels:
    component.aggrega.ai/type: "stateful-server"
spec:
  schema:
    values:
      # Expose the dial safely to the Developer with a typed contract.
      required_iops: { type: integer, min: 1000, max: 100000, required: true }
    infra:
      # Operator-owned sizing the Recipe below reads alongside the dial.
      storage: { size: { type: string, default: 100Gi } }
      compute: { instance_class: { type: string, default: db.m5.large } }
```

```yaml
# Domain 2: The Platform Catalog (the Recipe pipes the dial into provider infra)
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: aws-rds-high-perf-postgres
  version: 1.0.0
spec:
  implements: core/high-perf-postgres:^1.0.0
  capability: terraform
  source: ./modules/rds
  valuesMapping: |
    # The Recipe pipes the developer's values.required_iops into the provider's infra-side knob.
    iops: {{ .values.required_iops }}
    allocated_storage: "{{ .infra.storage.size }}"
    instance_class: "{{ .infra.compute.instance_class }}"
```

```yaml
# Domain 1: The Developer Intent (remains capability-agnostic)
components:
  trading-db:
    type: core/high-perf-postgres:1.0.0
    values:
      required_iops: 10000 # Developer dictates the hardware constraint safely
```

**Multi-Environment Scaling (the parameter-hoisting requirement).**
To scale this hardware constraint across GitOps environments (Dev vs. Prod) without mutating the developer's `Aggregate.yaml`, the developer hoists the value to the typed `parameters` contract. Ops fulfills the specific IOPS requirement via environment-specific `Release` files. The compiler's execution order protects the flow: parameter contract validation runs at resolution; interpolation resolves the parameter into the surrounding `values:` string; the Recipe's `valuesMapping:` template pipes the resolved value into the rendered output.

**1. The Developer Intent (abstracting the dial).**
The Developer knows they need to control IOPS, but they abstract the explicit number to the environment level via the typed `parameters` contract.

```yaml
spec:
  parameters:
    env_iops:
      type: integer
      min: 1000
      max: 100000
      description: Provisioned IOPS for the trading-db instance
  components:
    trading-db:
      type: core/high-perf-postgres:1.0.0
      values:
        required_iops: {{ .parameters.env_iops }} # Hoisted to the environment
```

**2. The GitOps Releases (Ops fulfilment).**
Ops fulfills the `parameters` contract in environment-specific `Release` files. The typed contract validates each Release-supplied value before interpolation runs.

- **Dev Environment (`release-dev.yaml`):** `env_iops: 1000`
- **Prod Environment (`release-prod.yaml`):** `env_iops: 25000`

**The compilation order.**
This mechanism is protected by the strict execution order of the compiler at resolution:

1. **Parameter contract validation.** Each Release-supplied parameter value validates against the Aggregate's typed `parameters:` declaration. A Prod value of `25000` validates (within `min: 1000, max: 100000`); a value of `500` would halt with a clear error.
2. **Interpolation.** The compiler reads the Prod `Release`'s parameter values and interpolates `25000` into the `Aggregate` YAML string at `values.required_iops`. The merged parameter map remains alive through rendering so path-template surfaces can read `.parameters.<slot>` directly; value-template surfaces consume the post-interpolation literal already written into the Aggregate's `values:` block. The map stays readable until every render phase has completed, and is reachable only from the compilation it was resolved for.
3. **Schema validation.** The Component's `schema:` declaration validates the resulting `values:` dictionary; `values.required_iops: 25000` satisfies the schema's `min: 1000, max: 100000`.
4. **Recipe valuesMapping rendering.** The bound Recipe's `valuesMapping:` template pipes `values.required_iops` into the provider's `infra`-shaped output (`iops: 25000`). The Wasm provider plugin generates the correct physical database configuration. The developer gets their explicit hardware control, Ops gets their environment-specific scaling, and the `Aggregate` remains capability-agnostic.
