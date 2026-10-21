# ArtifactLibrary

An ArtifactLibrary is a catalog entity that holds reusable **artifact bundles** — named sets of auxiliary output files that belong together. Recipes and FeatureRecipes that emit the same supporting resources — a CRD with its RBAC and a ConfigMap, a NetworkPolicy paired with an HPA — declare that set once in a library and reference it at consumption time via an `artifacts:` entry whose value is an `$import:` directive. The library entity is Tier 3: opt-in for catalogs that need cross-Recipe artifact reuse. Catalogs whose Recipes each carry their own auxiliary files ship without any ArtifactLibrary.

## The ArtifactLibrary's Role

Platform architects author ArtifactLibraries to centralise the auxiliary manifests that recur across the catalog's Recipes and FeatureRecipes. A library is not a deployable build instruction; it is a definitions namespace. Recipe and FeatureRecipe authors reference a bundle by an `$import:` directive, written once and consumed wherever the import resolves.

What distinguishes this library kind from the other three is the **grain of an entry**. A SchemaLibrary entry is one schema, a MappingLibrary entry is one template fragment, and a WorkloadLibrary entry is one Workload document — each a single body consumed at a single site. An ArtifactLibrary entry is a *set of files*, because the resources it groups are only useful together: importing a CRD without its RBAC produces a manifest set that does not work. That is why a bundle is the unit of reuse and a single consumption site expands into several outputs.

## Entity Envelope

An ArtifactLibrary entity carries the standard catalog envelope. `apiVersion: aggrega.ai/v1alpha1` and `kind: ArtifactLibrary` mark the entity kind; `metadata.name` is a PascalCase identifier; `metadata.version` follows strict semantic versioning. Both are required. `metadata.description`, `metadata.labels`, and `metadata.annotations` are optional — labels and annotations are opaque author-declared metadata for discovery and hub surfacing, and the compiler does not interpret their values. The library's content sits under `spec.artifacts`, a required map that must declare at least one bundle.

The envelope is closed at all three levels — the document root, `metadata`, and `spec` each reject keys the schema does not declare.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: ArtifactLibrary
metadata:
  name: PlatformArtifacts
  version: 1.0.0
spec:
  artifacts:
    OperatorSupport:
      crd.yaml: |
        apiVersion: apiextensions.k8s.io/v1
        kind: CustomResourceDefinition
        metadata:
          name: widgets.platform.example.com
        spec:
          group: platform.example.com
          scope: Namespaced
      rbac.yaml: |
        apiVersion: rbac.authorization.k8s.io/v1
        kind: Role
        metadata:
          name: "{{ .context.instance_id }}-operator"
        rules:
          - apiGroups: ["platform.example.com"]
            resources: ["widgets"]
            verbs: ["get", "list", "watch"]
```

## Authoring Artifact Bundles

`spec.artifacts` is two levels deep, and each level has a distinct job. The outer key is the **bundle name** — the identifier a consumer references. The inner keys are **filenames**, and each inner value is the Go-template body emitted to that file. A bundle must declare at least one file.

```yaml
spec:
  artifacts:
    NetworkBaseline:
      deny-all.yaml: |
        apiVersion: networking.k8s.io/v1
        kind: NetworkPolicy
        metadata:
          name: "{{ .context.instance_id }}-deny-all"
        spec:
          podSelector: {}
          policyTypes: ["Ingress"]
      allow-dns.yaml: |
        apiVersion: networking.k8s.io/v1
        kind: NetworkPolicy
        metadata:
          name: "{{ .context.instance_id }}-allow-dns"
```

A file body is a Go template fragment authored as a YAML string. Because a manifest is multi-line, file bodies use YAML's literal-style scalar (`|`) so newlines and indentation survive round-trip. A bundle entry's value must be a mapping of filename to a string body; writing a bare string where the bundle belongs, or a sequence, is rejected — the level a consumer imports is the bundle, not a single file.

The body is opaque to the entity envelope. The compiler stores each string verbatim at ArtifactLibrary load and does not parse the template there; the template parser runs at consumption time, when a Recipe or FeatureRecipe imports the bundle. Storing bodies verbatim preserves authoring fidelity for re-emission, and it means a template error surfaces where the bundle is consumed and its pillar context is known, rather than at the library.

File order within a bundle is the order the author wrote, preserved through load and consumption, so the emitted set is stable across builds.

Go template's full composition vocabulary is available inside a file body: `{{ define "name" }}...{{ end }}` declares reusable blocks, `{{ template "name" . }}` invokes them, and pipelines and functions follow the standard Go `text/template` package. The pillar context a file body may read — `.values`, `.infra`, `.locals`, `.context`, `.features`, and `.workload` and `.source` where the consuming Recipe declares them — is the context the consuming Recipe's own `artifacts:` entries read, documented on the [Recipe](recipe.md) page under the `artifacts:` field. A body that reads `.workload` where the consuming Recipe declares no `workload:`, or `.source` where it declares no `source:`, halts with a diagnostic naming the reference it could not satisfy — each pillar is checked on its own, so declaring one does not license reading the other.

## Single Authoring Mode

ArtifactLibrary ships with one authoring mode: Go templates. `spec` accepts no parallel authoring surface and no expressivity escape-hatch at the library level.

The reason is consumption-surface uniformity. Recipes and FeatureRecipes are Go-template throughout, and their own content evaluates through the same Go template engine that resolves an imported bundle. A parallel authoring surface would force authors to switch evaluation models within a single Recipe's rendering — one model for the Recipe's own content, another for any imported bundle. Keeping the surface uniform means authors learn one evaluation model and apply it everywhere.

Authors needing expressivity beyond Go template's composition vocabulary compose at a higher level — Components or Features that wrap the library bundles with their own substantive variation — rather than escalating into a second authoring language inside the library.

## Naming Conventions

Library names and bundle names follow PascalCase. The entity envelope's JSON Schema enforces the convention at two positions via pattern constraints:

- `metadata.name` matches `^[A-Z][A-Za-z0-9]*$`.
- `spec.artifacts` map keys match the same pattern via `propertyNames`.

An ArtifactLibrary with a non-PascalCase bundle name fails envelope validation at workspace load. The enforcement is load-bearing: bundle names appear in the `#/artifacts/<name>` reference fragment, so a non-PascalCase name would propagate through every consumer that imports the bundle, including the eventual hub UI surfacing.

The naming uniformity keeps the `#/artifacts/<name>` fragment legible: `#/artifacts/OperatorSupport` reads at a glance.

**Filenames inside a bundle are free-form, as long as each names a file.** They are not PascalCase and no schema pattern constrains them, because they name the files a build's output ends up carrying — `crd.yaml`, `deny-all.yaml`, `values-override.json` are all valid. What a filename must be is an ordinary relative file name, written plainly; the build refuses one that names no file of its own, as [Referencing Library Entries](#referencing-library-entries) describes. The two levels are constrained differently because they serve different readers: the bundle name is an identifier other entities cite, and the filenames are the names a consumer sees inside the directory the bundle is imported at.

## Referencing Library Entries

Recipe and FeatureRecipe authors reference a bundle inside an `artifacts:` entry whose value is an `$import:` map, by the bundle's bare-name identity:

```yaml
# Inside a Recipe's spec:
spec:
  artifacts:
    operator-support:
      $import: "PlatformArtifacts#/artifacts/OperatorSupport"
```

The `#/artifacts/<name>` fragment selects the bundle and distinguishes an artifacts reference from MappingLibrary's `#/mappings/<name>`, SchemaLibrary's `#/schemas/<name>`, and WorkloadLibrary's `#/workloads/<name>`. The reference carries no registry host; a host-bearing `oci://…` form is rejected both by the envelope schema and at the consumption site, so a physical registry location never enters authored source. An author may assert an optional minimum-version floor as `<Library>:<version>#/artifacts/<name>` — the version separator is `:`, matching the other library kinds and the lockfile pin, and writing `@` instead is refused with a diagnostic naming the corrected reference. The resolved version is supplied by the per-Release lockfile, which pins each consumed library by name, version, and content digest; physical location is bound at resolution time.

**The bundle owns its filenames, and the consuming key owns the directory they land in.** One `artifacts:` entry importing a bundle expands into one output per file in that bundle, each nested under the consumption key as `<key>/<filename>`. The key at the consumption site — `operator-support` above — names the whole consumption rather than any single file; the example emits `operator-support/crd.yaml` and `operator-support/rbac.yaml`. So a bundle name is chosen for legibility at the reference, the filenames are chosen for the reader of the output directory, and neither has to agree with the other. The consumption key is itself bounded to a single filename — a leading letter or digit, then letters, digits, dots, hyphens and underscores, with a key outside that alphabet failing envelope validation — so it names exactly one directory segment, and everything below that segment comes from the bundle. That is what lets a bundle's filenames stay free-form while the key stays strict: a filename is unique within its bundle, a key is unique within its document, and the key is the first segment of every path the entry emits, so no two `artifacts:` entries name one output. Free-form means free within that segment: a filename may carry a nested layout of its own — `crds/widget.yaml` lands at `<key>/crds/widget.yaml` — but it must be an ordinary relative file name beneath the key, written plainly, and a filename that is not one halts the build instead of placing the file somewhere the consuming Recipe never named. That refuses a name climbing above the key or naming an absolute location; `.` or `./`, and a name that collapses back onto the key such as `x/..`, which name the key's own directory rather than a file in it; and a name with a trailing or doubled `/` or a `.` or `..` part — `x/`, `a//b`, `./a`, `a/../b` — which is a second spelling of a file another name can carry, so `a//b` beside `a/b` would put two files at one path. The diagnostic names the bundle file and the key it was imported at. Two outputs that do carry the same filename halt the build when the node renders, which happens when two different input kinds contribute one filename. See [Recipe](recipe.md) for how `artifacts:` composes with the Recipe's other input kinds and for the two non-library authoring modes, and [vocabulary/cross-document-ref](../vocabulary/cross-document-ref.md) for the broader `$ref:` / `$import:` distinction.

## Cross-Library Composition

**A bundle file body is terminal content.** Unlike a MappingLibrary or WorkloadLibrary entry, a bundle file cannot be a field-root `$import:` redirect: a single file slot has no room for the several files another bundle would bring, so the compiler rejects that shape rather than resolving it into something the author did not write. A body whose first token is `$import:` halts with a diagnostic naming the bundle and the file.

Composition happens at the **consumption site** instead, where there is room for it. A Recipe that needs two bundles declares two `artifacts:` entries, and each expands independently:

```yaml
# Inside a Recipe's spec — compose bundles where the outputs land:
spec:
  artifacts:
    operator-support:
      $import: "PlatformArtifacts#/artifacts/OperatorSupport"
    network-baseline:
      $import: "PlatformArtifacts#/artifacts/NetworkBaseline"
```

An unknown library name, and a bundle name absent from a library that does resolve, are reported as distinct diagnostics, so an author can tell a missing dependency from a misspelled bundle name.

## Tier Placement

ArtifactLibrary is Tier 3 in the entity-tier documentation model — opt-in for catalogs that need cross-Recipe artifact reuse. Catalogs whose Recipes carry their own auxiliary files ship without any ArtifactLibrary entity; the tier marking signals "advanced; skip if not needed" for documentation navigation, not capability. The compiler treats ArtifactLibrary uniformly with the other catalog entity kinds: same envelope validation at workspace load, same OCI publishing pipeline at release time, same lockfile pinning by name, version, and content digest.

The library kind completes a set at the catalog level — SchemaLibrary holds reusable schema definitions, MappingLibrary holds reusable mapping fragments, WorkloadLibrary holds reusable workload content, and ArtifactLibrary holds reusable artifact bundles. Each is independently opt-in; catalogs ship the ones they need and none of the others.

## What ArtifactLibrary Is Not

A few common misconceptions worth heading off:

- **Not a substitute for inline `artifacts:`.** Most Recipes carry auxiliary files specific enough to belong inline, where the author reads them alongside the rest of the Recipe. An ArtifactLibrary helps when the SAME set of files accompanies many Recipes; for one-off content, inline authoring is the right choice.

- **Not a way to rename the files inside a bundle.** The filenames belong to the bundle. A consumer chooses the directory they land in — that is what the consumption key does — but not what any one of them is called: a consumer that needs a different filename either uses a bundle that declares it or authors the file inline.

- **Not a place for workload, mapping, or schema content.** A Workload document belongs in a WorkloadLibrary, a template fragment meant to be spliced into a surrounding mapping belongs in a MappingLibrary, and schema definitions belong in a SchemaLibrary. The library kinds split by content type, not by reuse pattern.

- **Not the mechanism for cross-cutting resources.** Auxiliary resources that apply across many components regardless of which Recipe realizes them — a backup sidecar attached to every datastore — belong on FeatureRecipe resource generation, which attaches by Feature rather than by Recipe. See [entities/featurerecipe.md](featurerecipe.md). An ArtifactLibrary factors out files that several Recipes each emit on their own behalf.

- **Not an independently deployable entity.** A bundle is artifact content, and artifact content is never addressable on its own — it exists as the input a Recipe or FeatureRecipe consumes. Publishing an ArtifactLibrary makes its bundles importable; it does not make them deployable.
