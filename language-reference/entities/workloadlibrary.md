# WorkloadLibrary

A WorkloadLibrary is a catalog entity that holds reusable Workload template fragments. Recipes and FeatureRecipes that deploy the same workload shape — a metrics-exposing server, a batch job, a sidecar pair — declare that shape once in a library and reference it at consumption time via a `workload: { $import: ... }` directive. The library entity is Tier 3: opt-in for catalogs that need cross-Recipe workload reuse. Catalogs whose Recipes each carry their own distinct workload shape ship without any WorkloadLibrary.

## The WorkloadLibrary's Role

Platform architects author WorkloadLibraries to centralise the Workload content that recurs across the catalog's Recipes and FeatureRecipes. A library is not a deployable build instruction; it is a definitions namespace. Recipe and FeatureRecipe authors reference library entries by an `$import:` directive, written once and consumed wherever the import resolves.

The split between "library" and "consumer" is intentional. Recipes encode build instructions (source, valuesMapping, artifacts). FeatureRecipes encode behavioural attachments. WorkloadLibraries encode only Workload content — the workload shape the provider synthesizes into provider-native manifests. Keeping the three roles distinct lets each entity kind evolve at its own cadence; authors who don't need shared workload content never encounter the library entity.

## Entity Envelope

A WorkloadLibrary entity carries the standard catalog envelope. `apiVersion: aggrega.ai/v1alpha1` and `kind: WorkloadLibrary` mark the entity kind; `metadata.name` is a PascalCase identifier; `metadata.version` follows strict semantic versioning. Both are required. `metadata.description`, `metadata.labels`, and `metadata.annotations` are optional — labels and annotations are opaque author-declared metadata, carried for whatever reads the library to match on, and the compiler does not interpret their values. The library's content sits under `spec.workloads`, a required map that must declare at least one entry.

The envelope is closed at all three levels — the document root, `metadata`, and `spec` each reject keys the schema does not declare.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: WorkloadLibrary
metadata:
  name: BaseWorkloads
  version: 1.0.0
spec:
  workloads:
    SimpleServer: |
      apiVersion: aggrega.ai/v1alpha1
      kind: Workload
      replicas: {{ optional .infra `replicas` 2 }}
      containers:
        app:
          image: "{{ .values.image }}"
          ports:
            web: {{ optional .values `port` 8080 }}
      services:
        http:
          type: ClusterIP
          ports:
            web: {{ optional .values `port` 8080 }}
```

## Authoring Workload Entries

Each entry is a Go template fragment authored as a YAML string. The entry's rendered output is a **whole Workload document** — it carries its own `apiVersion: aggrega.ai/v1alpha1` and `kind: Workload` — because a Recipe's `workload:` field takes one complete Workload, not a fragment spliced into a surrounding one, and the import replaces the whole field. A MappingLibrary entry is whole in the same way: importing one replaces the Recipe's entire `valuesMapping:`.

The body is opaque to the entity envelope. The compiler stores the string verbatim at WorkloadLibrary load and does not parse the template there; the template parser runs at consumption time, when a Recipe or FeatureRecipe imports the entry. Storing the fragment verbatim preserves authoring fidelity for re-emission, and it means a template error surfaces where the entry is consumed and its pillar context is known, rather than at the library.

Because a Workload document is multi-line, entries use YAML's literal-style scalar (`|`) so newlines and indentation survive round-trip:

```yaml
spec:
  workloads:
    BatchJob: |
      apiVersion: aggrega.ai/v1alpha1
      kind: Workload
      form: task
      containers:
        worker:
          image: "{{ .values.image }}"
          command: ["{{ .values.entrypoint }}"]
```

An entry's value must be a string scalar. Writing a mapping or a sequence where the body belongs is rejected — the entry body is template text, not structured YAML the compiler walks.

Go template's full composition vocabulary is available inside an entry: `{{ define "name" }}...{{ end }}` declares reusable blocks within a single library, `{{ template "name" . }}` invokes them, and pipelines and functions follow the standard Go `text/template` package. The pillar context an entry may read — `.values`, `.infra`, `.locals`, `.context`, `.features` — is the same context any Workload template reads, and is documented on the [Workload](workload.md) page under template evaluation.

The target provider must support workload synthesis. A Recipe that imports a library entry but binds to a provider that cannot synthesize a Workload halts loudly at render time rather than emitting a degraded shape; the standard-library catalog declares `workloadSchema` on the providers that do support it, as the documented contract.

## Single Authoring Mode

WorkloadLibrary ships with one authoring mode: Go templates. `spec` accepts no parallel authoring surface and no expressivity escape-hatch at the library level.

The reason is consumption-surface uniformity. Recipes and FeatureRecipes are Go-template throughout, and their own content evaluates through the same Go template engine that resolves an imported fragment. A parallel authoring surface would force authors to switch evaluation models within a single Recipe's rendering — one model for the Recipe's own content, another for any imported library entry. Keeping the surface uniform means authors learn one evaluation model and apply it everywhere.

Authors needing expressivity beyond Go template's composition vocabulary compose at a higher level — Components or Features that wrap the library entries with their own substantive variation — rather than escalating into a second authoring language inside the library.

## Naming Conventions

Library names and workload entry keys follow PascalCase. The entity envelope's JSON Schema enforces the convention at two positions via pattern constraints:

- `metadata.name` matches `^[A-Z][A-Za-z0-9]*$`.
- `spec.workloads` map keys match the same pattern via `propertyNames`.

A WorkloadLibrary with a non-PascalCase key in `spec.workloads` fails envelope validation at workspace load. The enforcement is load-bearing: workload entry keys appear in the `#/workloads/<name>` reference fragment, so a non-PascalCase key would propagate through every consumer that imports the entry.

The naming uniformity keeps the `#/workloads/<name>` fragment legible: `#/workloads/BatchJob` reads at a glance.

## Referencing Library Entries

Recipe and FeatureRecipe authors reference a workload entry inside a `workload: { $import: ... }` block by its bare-name identity:

```yaml
# Inside a Recipe's spec:
spec:
  workload:
    $import: "BaseWorkloads#/workloads/SimpleServer"
```

The `#/workloads/<name>` fragment selects the entry and distinguishes a workload reference from MappingLibrary's `#/mappings/<name>` and SchemaLibrary's `#/schemas/<name>`. The reference carries no registry host; a host-bearing `oci://…` form is rejected both by the envelope schema and at the consumption site, so a physical registry location never enters authored source. An author may assert an optional minimum-version floor as `<Library>:<version>#/workloads/<name>` — the version separator is `:`, matching recipe/feature mappings and the lockfile pin, and writing `@` instead is refused with a diagnostic naming the corrected reference. The resolved version is supplied by the per-Release lockfile, which pins each consumed library by name, version, and content digest; physical location is bound at resolution time.

The same `workload:` field accepts two other forms — an inline Go template string, and a `$import:` of a local file path relative to the Recipe directory. The three forms are distinguished by the content's shape, and all three produce the same post-parse Workload. See [Recipe](recipe.md) for how `workload:` composes with the Recipe's other input kinds, and [vocabulary/cross-document-ref](../vocabulary/cross-document-ref.md) for the broader `$ref:` / `$import:` distinction.

## Cross-Library Composition

A WorkloadLibrary entry can be a **field-root `$import:` redirect**: its body's first token is `$import: <Library>#/workloads/<entry>`, which replaces the whole entry with the referenced entry's content — reuse by identity, not in-place templating. The redirect resolves at consumption time, not at WorkloadLibrary load, and it resolves recursively, so an imported entry may itself be a field-root `$import:`. A chain that loops back on itself halts with a diagnostic naming the cycle. `$import:` is whole-entry only; it is not a mid-fragment template function. To compose template text *within* a single entry, use Go template `define` / `template`.

```yaml
# In library A — alias an entry to a shared entry in another library:
spec:
  workloads:
    StandardServer: |
      $import: PlatformWorkloads#/workloads/MetricsServer
```

An unknown library name, and an entry name absent from a library that does resolve, are reported as distinct diagnostics, so an author can tell a missing dependency from a misspelled entry.

## Tier Placement

WorkloadLibrary is Tier 3 in the entity-tier documentation model — opt-in for catalogs that need cross-Recipe workload reuse. Catalogs whose Recipes carry their own distinct workload content ship without any WorkloadLibrary entity; the tier marking signals "advanced; skip if not needed" for documentation navigation, not capability. The compiler treats WorkloadLibrary uniformly with the other catalog entity kinds: same envelope validation at workspace load, same OCI publishing pipeline at release time, same lockfile pinning by name, version, and content digest.

The library kind is one of a set at the catalog level — SchemaLibrary holds reusable schema definitions, MappingLibrary holds reusable mapping fragments, ArtifactLibrary holds reusable artifact bundles, WorkloadLibrary holds reusable workload content. Each is independently opt-in; catalogs ship the ones they need and none of the others.

## What WorkloadLibrary Is Not

A few common misconceptions worth heading off:

- **Not a substitute for inline `workload:`.** Most Recipes carry workload content specific enough to belong inline, where the author reads it alongside the rest of the Recipe. A WorkloadLibrary helps when the SAME workload shape appears across many Recipes; for one-off content, inline authoring is the right choice.

- **Not a place for partial fragments.** An entry renders to a complete Workload document. A Recipe's values document belongs in a MappingLibrary, a set of auxiliary files in an ArtifactLibrary, and schema definitions in a SchemaLibrary. The library kinds split by content type, not by reuse pattern.

- **Not an independently deployable entity.** A library entry is Workload content, and Workload content is never addressable on its own — it exists as the input a Recipe or FeatureRecipe consumes. Publishing a WorkloadLibrary makes its entries importable; it does not make them deployable.

- **Not parametric reuse beyond Go template's mechanisms.** Authors needing parametric variation use Go template's `{{ define }}` + `{{ template }}` mechanics inside library entries, or the pillar context the consuming Recipe supplies. The library entity itself ships no parametric-helper machinery.
