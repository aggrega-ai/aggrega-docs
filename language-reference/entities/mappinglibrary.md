# MappingLibrary

A MappingLibrary is a catalog entity that holds reusable Go template fragments. Recipes and FeatureRecipes that share template content — probe blocks, resource-limit blocks, label-propagation blocks, recurring `valuesMapping:` boilerplate — declare those fragments once in a library and reference them at consumption time via `$import:` directives. The library entity is Tier 3: opt-in for catalogs that need cross-Recipe mapping reuse. Catalogs without repeated template content ship without any MappingLibrary.

## The MappingLibrary's Role

Platform architects author MappingLibraries to centralise Go template fragments that recur across the catalog's Recipes and FeatureRecipes. A library is not a deployable build instruction; it is a definitions namespace. Recipe and FeatureRecipe authors reference library entries by an `$import:` directive, written once and consumed wherever the import resolves.

The split between "library" and "consumer" is intentional. Recipes encode build instructions (source, valuesMapping, infraMapping, artifacts). FeatureRecipes encode behavioral attachments. MappingLibraries encode only template fragments — the Go-template content that other entities consume at render time. Keeping the three roles distinct lets each entity kind evolve at its own cadence; authors who don't need shared template content never encounter the library entity.

## Entity Envelope

A MappingLibrary entity carries the standard catalog envelope. `apiVersion: aggrega.ai/v1alpha1` and `kind: MappingLibrary` mark the entity kind; `metadata.name` is a PascalCase identifier; `metadata.version` follows strict semantic versioning. The library's content sits under `spec.mappings`, a required map that must declare at least one entry.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: MappingLibrary
metadata:
  name: BaseMappings
  version: 1.0.0
spec:
  mappings:
    SimpleValues: 'image: {{ .Values.image }}'
    Replicas: 'replicas: {{ .Values.replicas | default 1 }}'
```

*Note on the `| default` filter and the `.Values` capital-V convention in this example: the fragment shown here is shaped for downstream consumption by a Helm chart's template engine, where Helm conventions (`.Values.X` for chart values, `default` for absent-field fallback, `include` / `tpl` / `required` for chart-internal composition) are the established idiom. When a MappingLibrary fragment is consumed by an Aggrega-side `valuesMapping:` surface (Recipe `valuesMapping:` content evaluated by Aggrega's renderer), the fragment authoring shifts to Aggrega's conventions: lowercase `.values.X`, and the presence-aware `optional` helper for absent-field fallback. The two conventions correspond to two consumption sites; the library entity stores fragments verbatim and the authoring shape follows where the fragment is meant to render.*

## Authoring Mapping Entries

Each mapping entry is a Go template fragment authored as a YAML string. The fragment is opaque to the entity envelope — the compiler stores the string verbatim at MappingLibrary load and parses it at consumption time when a Recipe or FeatureRecipe imports the entry via `valuesMapping: { $import: ... }`.

Short fragments fit on a single line:

```yaml
spec:
  mappings:
    AppName: 'name: {{ .Values.app | required "app name required" }}'
```

Multi-line fragments use YAML's literal-style scalar (`|`) so newlines and indentation survive round-trip:

```yaml
spec:
  mappings:
    ProbeBlock: |
      readinessProbe:
        httpGet:
          path: /healthz
          port: {{ .Values.port }}
      livenessProbe:
        httpGet:
          path: /healthz
          port: {{ .Values.port }}
```

Go template's full composition vocabulary is available inside fragments: `{{ define "name" }}...{{ end }}` declares reusable blocks within a single library; `{{ template "name" . }}` invokes them; pipelines and functions are supported per the standard Go `text/template` package.

## Single Authoring Mode

MappingLibrary ships with one authoring mode: Go templates. There is no parallel `mappingsJsonnet:` field, no companion authoring surface, no expressivity escape-hatch at the library level. Three reasons drive the single-authoring-mode posture:

- **Go template's composition vocabulary already covers the parametric-helper use case.** `{{ define }}` + `{{ template }}` + the `$import:` directive at consumption time provide the reusable-block + parameterized-invocation mechanics that a parallel Jsonnet surface would address.

- **Consumption surface uniformity.** Recipes and FeatureRecipes are Go-template throughout; their own content evaluates through the same Go template engine that resolves imported fragments. A parallel Jsonnet surface would force authors to switch evaluation models within a single Recipe's rendering pass — Go template for the Recipe's own content, Jsonnet for any imported library fragment. Keeping the surface uniform means authors learn one evaluation model and apply it everywhere.

- **One platform language is enough.** Catalog authors learn the languages the platform requires. Adding Jsonnet would add one more language to the platform surface — Jsonnet's syntax, semantics, and toolchain dependency (a Jsonnet interpreter shipped alongside the Go template engine). The marginal benefit doesn't justify the expansion.

Authors needing expressivity beyond what Go template's composition vocabulary offers compose at a higher level — Components or Features that wrap the library entries with their own substantive variation — rather than escalating into a parallel authoring language inside MappingLibrary itself.

## Naming Conventions

Library names and mapping entry keys follow PascalCase. The entity envelope's JSON Schema enforces the convention at two positions via pattern constraints:

- `metadata.name` matches `^[A-Z][A-Za-z0-9]*$`.
- `spec.mappings` map keys match the same pattern via `propertyNames`.

A MappingLibrary with a non-PascalCase key in `spec.mappings` fails envelope validation at workspace load. The enforcement is load-bearing: mapping entry keys appear in the `#/mappings/<name>` reference fragment; non-PascalCase keys would propagate through every consumer that imports the entry, including the eventual hub UI surfacing.

The naming uniformity keeps the `#/mappings/<name>` fragment legible: `#/mappings/ProbeBlock` reads at a glance.

## Referencing Library Entries

Recipe and FeatureRecipe authors reference a mapping entry inside a `valuesMapping: { $import: ... }` block. MappingLibrary consumption is not yet executable — the renderer recognizes the library-import form but reports it as not-yet-supported pending that work — so the form authored today is the `oci://` reference the dispatch recognizes:

```yaml
# Inside a Recipe's valuesMapping block:
spec:
  valuesMapping:
    $import: "oci://hub.aggrega.ai/BaseMappings@1.0.0#/mappings/ProbeBlock"
```

The `#/mappings/<name>` fragment selects the entry and distinguishes a mapping reference from SchemaLibrary's `#/schemas/<name>`. When MappingLibrary consumption lands, the `$import:` reference converges to the same bare-name identity model SchemaLibrary `$ref:` already uses — `<Library>#/mappings/<name>`, carrying no registry host and no version, with the version supplied by the per-Release lockfile (name + version + content digest) and physical location bound at resolution time. Until then, the `oci://` form above is the recognized spelling.

## Cross-Library Composition

A MappingLibrary entry's body may reference another library entry via `$import:` directives inside the Go template fragment. Cross-library references resolve at consumption time (Recipe rendering), not at MappingLibrary load — the library entity's storage layer is opaque to the directive; the consumption-side template engine handles the lookup against the workspace lockfile's pinned library set.

```yaml
# In library A:
spec:
  mappings:
    ProbeWithMonitoring: |
      {{ template "Probe" . }}
      {{ $import "oci://hub.aggrega.ai/MonitoringLibrary@2.1.0#/mappings/PrometheusAnnotations" }}
```

Cycle detection across library chains and version pinning across cross-library chains are concerns at the consumption-side machinery. The library entity itself ships no cycle-detection state; libraries can reference each other freely at the authoring surface.

## Tier Placement

MappingLibrary is Tier 3 in the entity-tier documentation model — opt-in for catalogs that need cross-Recipe mapping reuse. Catalogs without repeated template content ship without any MappingLibrary entity; the tier marking signals "advanced; skip if not needed" for documentation navigation, not capability. The compiler treats MappingLibrary uniformly with the other catalog entity kinds: same envelope validation at workspace load, same OCI publishing pipeline at release time.

The library kind pairs naturally with SchemaLibrary at the catalog level — SchemaLibrary holds reusable schema definitions; MappingLibrary holds reusable template fragments. Catalogs needing both ship both; catalogs needing neither ship neither.

## What MappingLibrary Is Not

A few common misconceptions worth heading off:

- **Not a substitute for inline `valuesMapping:`.** Most Recipes carry simple `valuesMapping:` content that benefits from being authored inline — the Recipe stays self-contained and the author reads the mapping content alongside the rest of the Recipe. MappingLibrary helps when the SAME fragment appears across many Recipes; for one-off mappings, inline authoring is the right choice.

- **Not a place for schema content.** Schema definitions (JSON Schema 2020-12) belong in SchemaLibrary; template fragments belong here. The two library kinds split by content type, not by reuse pattern.

- **Not parametric reuse beyond Go template's mechanisms.** Authors needing parametric variation use Go template's `{{ define }}` + `{{ template arg }}` mechanics inside library entries, or compose Components / Features that wrap the library entries with their own variation. The library entity itself ships no parametric-helper machinery (no `$templates:` analogous to SchemaLibrary's parametric-helpers); Go template's composition vocabulary covers the same use case.
