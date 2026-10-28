# MappingLibrary

A MappingLibrary is a catalog entity that holds reusable Go template fragments. Recipes and FeatureRecipes that share a whole `valuesMapping:` document — the values several Recipes sourcing the same chart each hand it — declare it once in a library and reference it at consumption time via a `valuesMapping: { $import: ... }` directive. The library entity is Tier 3: opt-in for catalogs that need cross-Recipe mapping reuse. Catalogs without repeated template content ship without any MappingLibrary.

## The MappingLibrary's Role

Platform architects author MappingLibraries to centralise Go template fragments that recur across the catalog's Recipes and FeatureRecipes. A library is not a deployable build instruction; it is a definitions namespace. Recipe and FeatureRecipe authors reference library entries by an `$import:` directive, written once and consumed wherever the import resolves.

The split between "library" and "consumer" is intentional. Recipes encode build instructions (source, valuesMapping, artifacts). FeatureRecipes encode behavioral attachments. MappingLibraries encode only template fragments — the Go-template content that other entities consume at render time. Keeping the three roles distinct lets each entity kind evolve at its own cadence; authors who don't need shared template content never encounter the library entity.

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
    SimpleValues: 'image: {{ .values.image }}'
    Replicas: 'replicas: {{ optional .infra "replicas" 1 }}'
```

*An entry is evaluated by the consuming Recipe's own template engine, against the Recipe's render context, so it reads the lowercase pillars a Recipe's own `valuesMapping:` reads — `.values`, `.infra`, `.context` and the rest — and uses the same functions, such as the presence-aware `optional` helper for an absent key. `.Values`, Helm's spelling for chart values, is not a root that context defines: an entry reading it halts the build, naming the reference.*

## Authoring Mapping Entries

Each mapping entry is a Go template fragment authored as a YAML string. The fragment is opaque to the entity envelope — the compiler stores the string verbatim at MappingLibrary load and parses it at consumption time when a Recipe or FeatureRecipe imports the entry via `valuesMapping: { $import: ... }`. The import replaces the Recipe's whole `valuesMapping:` — the `$import:` map carries no other key — so an entry is a complete values document rather than a piece spliced into one.

Short fragments fit on a single line:

```yaml
spec:
  mappings:
    AppName: 'fullnameOverride: "{{ .context.rendered_name }}"'
```

Multi-line fragments use YAML's literal-style scalar (`|`) so newlines and indentation survive round-trip:

```yaml
spec:
  mappings:
    ProbeBlock: |
      readinessProbe:
        httpGet:
          path: /healthz
          port: {{ .values.port }}
      livenessProbe:
        httpGet:
          path: /healthz
          port: {{ .values.port }}
```

Go template's full composition vocabulary is available inside fragments: `{{ define "name" }}...{{ end }}` declares reusable blocks within a single library; `{{ template "name" . }}` invokes them; pipelines and functions are supported per the standard Go `text/template` package.

## Single Authoring Mode

MappingLibrary ships with one authoring mode: Go templates. `spec` accepts no parallel authoring surface and no expressivity escape-hatch at the library level.

The reason is consumption-surface uniformity. Recipes and FeatureRecipes are Go-template throughout, and their own content evaluates through the same Go template engine that resolves an imported entry, so an entry reads exactly as the Recipe's own text does and authors learn one evaluation model. Go template's composition vocabulary — `{{ define }}` and `{{ template }}` within a library, and the `$import:` directive at consumption time — provides the reusable blocks and parameterized invocation a library needs.

Authors needing expressivity beyond what Go template's composition vocabulary offers compose at a higher level — Components or Features that wrap the library entries with their own substantive variation — rather than escalating into a parallel authoring language inside MappingLibrary itself.

## Naming Conventions

Library names and mapping entry keys follow PascalCase. The entity envelope's JSON Schema enforces the convention at two positions via pattern constraints:

- `metadata.name` matches `^[A-Z][A-Za-z0-9]*$`.
- `spec.mappings` map keys match the same pattern via `propertyNames`.

A MappingLibrary with a non-PascalCase key in `spec.mappings` fails envelope validation at workspace load. The enforcement is load-bearing: mapping entry keys appear in the `#/mappings/<name>` reference fragment; non-PascalCase keys would propagate through every consumer that imports the entry.

The naming uniformity keeps the `#/mappings/<name>` fragment legible: `#/mappings/ProbeBlock` reads at a glance.

## Referencing Library Entries

Recipe and FeatureRecipe authors reference a mapping entry inside a `valuesMapping: { $import: ... }` block by its bare-name identity:

```yaml
# Inside a Recipe's valuesMapping block:
spec:
  valuesMapping:
    $import: "BaseMappings#/mappings/ProbeBlock"
```

The `#/mappings/<name>` fragment selects the entry and distinguishes a mapping reference from SchemaLibrary's `#/schemas/<name>`. The reference uses the same bare-name identity model as SchemaLibrary `$ref:` — `<Library>#/mappings/<name>`, carrying no registry host. The version is supplied by the per-Release lockfile (name + version + content digest); an author may assert an optional minimum-version floor as `<Library>:<version>#/mappings/<name>` (the version separator is `:`, matching recipe/feature mappings and the lockfile pin), and physical location is bound at resolution time.

## Cross-Library Composition

A MappingLibrary entry can be a **field-root `$import:` redirect**: its body's first token is `$import: <Library>#/mappings/<entry>`, which replaces the whole entry with the referenced entry's content — reuse by identity, not in-place templating. The redirect resolves at consumption time (Recipe rendering), not at MappingLibrary load, and recursively — an imported entry may itself be a field-root `$import:`. `$import:` is whole-entry only; it is not a mid-fragment template function. To compose template text *within* a single fragment, use Go template `define` / `template`.

```yaml
# In library A — alias an entry to a shared entry in another library:
spec:
  mappings:
    StandardProbe: |
      $import: MonitoringLibrary#/mappings/PrometheusAnnotations
```

Libraries can reference each other freely. A chain that loops back on itself halts when the consuming Recipe renders, with a diagnostic naming each step of the cycle.

## Tier Placement

MappingLibrary is Tier 3 in the entity-tier documentation model — opt-in for catalogs that need cross-Recipe mapping reuse. Catalogs without repeated template content ship without any MappingLibrary entity; the tier marking signals "advanced; skip if not needed" for documentation navigation, not capability. The compiler treats MappingLibrary uniformly with the other catalog entity kinds: same envelope validation at workspace load, same OCI publishing pipeline at release time.

The library kind pairs naturally with SchemaLibrary at the catalog level — SchemaLibrary holds reusable schema definitions; MappingLibrary holds reusable template fragments. Catalogs needing both ship both; catalogs needing neither ship neither.

## What MappingLibrary Is Not

A few common misconceptions worth heading off:

- **Not a substitute for inline `valuesMapping:`.** Most Recipes carry simple `valuesMapping:` content that benefits from being authored inline — the Recipe stays self-contained and the author reads the mapping content alongside the rest of the Recipe. MappingLibrary helps when the SAME fragment appears across many Recipes; for one-off mappings, inline authoring is the right choice.

- **Not a place for schema content.** Schema definitions (JSON Schema 2020-12) belong in SchemaLibrary; template fragments belong here. The library kinds split by content type, not by reuse pattern.

- **Not parametric reuse beyond Go template's mechanisms.** Authors needing parametric variation use Go template's `{{ define }}` + `{{ template arg }}` mechanics inside library entries, or compose Components / Features that wrap the library entries with their own variation. The library entity itself ships no parametric-helper machinery (no `templates` block analogous to SchemaLibrary's `spec.templates` parametric helpers); Go template's composition vocabulary covers the same use case.
