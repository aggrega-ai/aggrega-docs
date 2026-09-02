# aggrega inspect

`aggrega inspect` renders a human-readable view of any Aggrega entity — a catalog Component, an authored entity file, or a fully-resolved Release. It is the canonical debug surface for understanding what the compiler will produce: which Components extend which bases, which Recipe maps to each type, which Features attach to each node, and exactly where each Feature's contributions came from.

Each entity kind has a natural "contract" view. `inspect` shows that contract — the schema a Component publishes, the mappings a Manifest declares, the topology an Aggregate builds, the per-node Feature attachments a Release resolves to. Tutorial and conceptual material lives elsewhere; `inspect` answers "what does this entity actually resolve to?"

A single positional argument routes by content shape; no subcommand is needed. The command dispatches per the following heuristic:

| Identifier shape | Dispatch | Output |
| --- | --- | --- |
| Starts with `./`, `../`, or `/`, or ends with `.yaml` / `.yml` | **File branch** | Per-file inspection keyed off the file's `kind:` header. |
| Starts with `oci://` | **OCI branch** | Reserved for catalog distribution; not yet implemented. Resolve to a local path or use a catalog name. |
| Anything else | **Catalog branch** | Look up the identifier in the catalog search stack across every entity kind; resolve `extends:` chains; render the matched kind's own view. |

## Three detail levels

`--list`, the default, and `--detail` form a uniform three-level verbosity discipline that every kind honors. `--list` and `--detail` are mutually exclusive — passing both is refused rather than silently resolved.

- **`--list`** — identifiers only. A Component lists its name and its uses-socket names; a MappingLibrary lists its mapping names; an Aggregate lists its component names with their types.
- **default** — a structured overview tuned for interactive use. The shape is per-kind: a Component shows its schema and sockets; an Aggregate shows components, their values and edges, and the dependency graph; a Release shows the per-boundary node tree with Feature attachments.
- **`--detail`** — full field bodies. Everything the kind carries: a Component adds its self-inject mechanisms, required Features, and labels; a MappingLibrary expands each mapping's full template body; a Recipe adds its workload body, provides, and assertions.

A few kinds use the levels to surface progressively more of an authored body. A MappingLibrary at `--list` shows mapping names; at the default level it adds each mapping's synthesized usage example; at `--detail` it expands the full template body.

## Resolution: `--raw` and `--resolved`

Each kind has a natural default resolution depth (see the table below). `--raw` and `--resolved` are always-available overrides, and they are mutually exclusive — passing both is refused rather than silently resolved:

- **`--raw`** opts out of all resolution — the entity is emitted as authored, straight from the file.
- **`--resolved`** opts in to the kind's full resolution depth.

For kinds that default as-authored, `--raw` is a no-op and `--resolved` triggers what resolution the kind supports. For kinds that default resolved, `--raw` is the as-authored bypass.

`--raw` reproduces the file, so a value an author declared sensitive appears in it exactly as authored. That is the contract, not a gap — an as-authored view that quietly withheld part of itself would not be as-authored. Handle `--raw` output the way you handle the entity file it came from. The same applies to `--output yaml`; see [Machine-readable output](#machine-readable-output) below.

## Per-kind defaults

`inspect` knows ten standalone-inspectable kinds. The catalog kinds render as-authored by default — their files are self-contained contracts. The instance kinds default to a resolved view, because their authored YAML is only the starting point for a cascade or a pipeline.

| Kind | Default | What "resolved" means |
| --- | --- | --- |
| Component | as-authored | The file is a self-contained contract; resolution is against a Manifest binding, surfaced via `--show-implements`. |
| Feature | as-authored | Same as Component. |
| Recipe | as-authored | `--show-implements` resolves the `spec.implements` Component reference. |
| FeatureRecipe | as-authored | `--show-implements` resolves the `spec.implements` Feature reference. |
| MappingLibrary | as-authored | Entries are opaque Go-template strings; rendering happens at consumption time. |
| SchemaLibrary | as-authored | Entries are reusable schema and template definitions resolved at consumption time. |
| Plugin | as-authored | The file is a self-contained plugin contract: socket types, per-export capabilities, runtime constraints, and signature pointer. Addressable by file path, or by its `<pluginType>/<name>` coordinate against the catalog. |
| Manifest | resolved | The `extends:` chain is applied; the resolved component and feature mappings are laid out. |
| Aggregate | resolved | The topology is built — the uses-graph and ordering are computed. |
| Release | resolved | The full pipeline runs: resolve, expand annotations, run guards, build topology, build IR. |

A file whose `kind:` is `Workload` is rejected: a Workload exists only embedded in a Recipe and is not a standalone inspectable entity. Inspect a Recipe to see its Workload.

## Resolution depth per kind

Most kinds have no pipeline — `inspect` reads the file and renders it. Three instance kinds resolve meaningfully:

- **Manifest** applies its `extends:` chain — file-import following — and renders the merged component and feature mappings. `--raw` shows the file as authored.
- **Aggregate** builds its topology: the uses-graph is constructed and the dependency ordering is computed. The default view shows components with their values and edges, followed by the dependency graph. `--raw` shows the authored subsystem tree.
- **Release** runs the entire compilation pipeline up to the IR — resolve, expand annotations, run guards, build topology, build IR — and renders the per-boundary node tree with each node's Feature attachments and their provenance. `--raw` emits the Release file verbatim with no pipeline.

There is no separate depth flag; the `--raw` / `--resolved` toggle is the only resolution control, layered on each kind's natural default.

## Error behavior

`inspect` aborts on the first error. When a referenced sibling file fails to load — a Release pointing at a missing Aggregate, a broken catalog entity in the search stack — the command stops with a clear message rather than rendering partial output. There is no continue-on-error mode.

A file whose `kind:` is unrecognized reports the unknown kind and the file it came from. A `Workload` file reports that the kind is embedded-only and names the entity it embeds under. An `oci://` identifier reports that OCI inspection is not yet implemented and suggests resolving to a local path or a catalog name.

## Catalog resolution

The catalog search stack is assembled with a layered precedence: `--catalog` flags (prepended, in order) come first, then the workspace's `catalog_dirs` from `.aggrega-config.yaml`, then a default of the current directory when neither is set. The stack is first-win — the earliest directory to declare an entity identity owns it; a later directory's copy is shadowed. The catalog branch resolves the identifier against this stack across every entity kind, in a fixed precedence, and renders the first match through that kind's own view; the file and release branches load referenced catalog entities from it when a Manifest mapping or `extends:` parent must be resolved.

## Deprecation and withdrawal notices

A publisher can record a marker against an artifact after publishing it, stating that the published version is deprecated or withdrawn. When the catalog branch resolves an entity, `inspect` reports any such marker beneath the entity's own view — for every kind it resolves by name, not only for a Component.

The notice names the severity the publisher recorded — `warning`, `error` or `retracted` — together with the version the marker was recorded on, the reason, the replacement where one is named, and the date it was issued. All three severities are reported. That is wider than the set which changes what a build resolves to: a version marked `retracted` is excluded from version selection, while `warning` and `error` are advisory and still selected. `inspect` shows you what a publisher said; it does not decide what you get.

The notice is read from the local index of the registry the entity resolves from, which `aggrega registry update` builds — so it needs no network and works in an offline workspace. Because the index is a snapshot, the notice ends by stating when that snapshot was taken and names the command that refreshes it. A workspace with no index built reports nothing, and an absent notice therefore means "nothing recorded in this snapshot" rather than "nothing recorded".

A marker is reported only when its own signature verifies against the signers the registry's trust policy honors. An unsigned marker, or one whose signature does not verify, is not reported: a claim that cannot be authenticated is not presented as fact.

The notice accompanies the human-readable views. `--output yaml` emits the entity document alone, so a consumer parsing it receives exactly the document.

## Worked examples

### Catalog Component lookup

```text
$ aggrega inspect core/server:1.0.0 --catalog ./catalog

Component: core/server:1.0.0
Schema:
  |
      values: { port?: int | *8080 }
Uses sockets:
  db: selector="component.aggrega.ai/type=stateful-server"
```

The default view shows the resolved schema (after any `extends:` merge) and the declared uses-sockets. `--detail` adds the self-inject mechanisms, required Features, and labels; `--list` shows just the Component identifier and its socket names.

### Feature

```text
$ aggrega inspect ./features/metrics.yaml

Feature: core/metrics:1.0.0
Schema:
  |
      values: { port?: int | *9090 }
Uses sockets:
  backend: selector="component.aggrega.ai/type=stateful-server"
    inject: [env]
Secret slots:
  token (required)
Targeting:
  appliesTo: component.aggrega.ai/type=server
Labels:
  feature.aggrega.ai/category: observability
```

### Recipe with `--show-implements`

A Recipe's default view shows one section per input mode it declares, its capability, and its value mapping. `--show-implements` resolves the `spec.implements` reference against the catalog and renders the bound Component, together with the attachments that Component requires:

```text
$ aggrega inspect ./recipes/api-server-recipe.yaml --show-implements --catalog ./catalog

Recipe: core/api-server-recipe:1.0.0
Implements: core/api-server:1.0.0
Capability: helm
## Synthesized
  workload: inline
valuesMapping: (none)
Implements Component: core/api-server:1.0.0
  requires attachment (observability): core/metrics
```

### Recipe declaring several input modes

A Recipe's input modes compose by addition: a `source:` to render, a `workload:` to synthesize and an `artifacts:` map each contribute output, and a Recipe may declare any combination of them. `inspect` reports every mode the Recipe declares rather than picking one, so what you see is the set you authored:

```text
$ aggrega inspect ./recipes/api-server-composed.yaml

Recipe: core/api-server-composed:1.0.0
Implements: core/api-server:1.0.0
Capability: helm
## Sourced
  source: oci://charts.example.com/api-server:2.1.0
## Synthesized
  workload: inline
valuesMapping: inline template
Artifacts: 2
  - servicemonitor.yaml
  - networkpolicy.yaml
```

The sections are ordered `source:` → `workload:` → `artifacts:`, the same order a build applies when it resolves a Recipe to a single mode name and when it reports which declared mode the bound provider cannot honour — so this view and a build's diagnostics name the modes in one order. A Recipe declaring neither a `source:` nor a `workload:` is reported as artifacts-only, which is the one case where the view names a single mode.

### Manifest (resolved by default)

```text
$ aggrega inspect ./prod-manifest.yaml

Manifest: prod-manifest:1.0.0

Component Mappings:
  Type                                     → Recipe
  core/compute/api-server                  helm-api-server-synthesized-with-artifacts:1.0.0
  core/compute/web-ui                      helm-web-ui-synthesized-with-artifacts:1.0.0
  core/datastore/postgres                  helm-postgres-synthesized-with-artifacts:1.0.0

Feature Mappings:
  Type                                     → FeatureRecipe
  core/k8s-dns-resolver                    k8s-dns-patcher:1.0.0

Annotation Bindings:
  (none)
```

The default view applies the Manifest's `extends:` chain and lays out the resolved component and feature mappings plus the annotation bindings. `--raw` shows the file as authored, before extends resolution.

### Aggregate (resolved by default)

```text
$ aggrega inspect ./fullstack-app.yaml

Aggregate: fullstack-app:1.0.0

Components:
  backend  (type: core/compute/api-server)
    Values: (none)
    Uses:
      databases:
        - data.main-db
  frontend  (type: core/compute/web-ui)
    Values: (none)
    Uses:
      apis:
        - my-api → backend
    main-db  (type: core/datastore/postgres)
      Values:
        database_name: app_production
      Uses: (none)

Dependency Graph:
  data.main-db
    ↑ backend
  backend
    ↑ frontend
```

The default view builds the topology and shows each component with its values and uses-edges, followed by the computed dependency graph. The subsystem tree is rendered with nesting; `--flat` renders one section per node, each keyed by its full dotted path.

### Release (resolved by default)

The Release view is the highest-stakes inspection. It runs the full pipeline and renders, per boundary, every Component node, its uses-edges, and every Feature attached to that node — each with the **attachment slot it fills** and whether it handles **declared-sensitive** material, plus a **provenance bracket** revealing where the attachment came from:

```text
$ aggrega inspect ./prod-release.yaml --catalog ./catalog

Release: prod-release:1.0.0

Boundary: backend-ns
  Directory: ./dist/backend
  Annotations (provider-consumed):
    aggrega.ai/namespace: backend-zone
  Component: backend  (type: core/compute/api-server:1.0.0)
    Uses:
      data.main-db → data.main-db  [cross-boundary]
    Features: (none)

Boundary: frontend-ns
  Directory: ./dist/frontend
  Annotations (provider-consumed):
    aggrega.ai/namespace: frontend-zone
  Component: frontend  (type: core/compute/web-ui:1.0.0)
    Uses:
      my-api → backend  [cross-boundary]
    Features:
    - cross-namespace-routing (core/k8s-dns-resolver:1.0.0)    [free]    [explicit]

Boundary: data-ns
  Directory: ./dist/data
  Annotations (provider-consumed):
    aggrega.ai/namespace: database-zone
  Component: data.main-db  (type: core/datastore/postgres:1.0.0)
    Features: (none)
```

Each boundary carries its output directory and its provider-consumed annotations; each component under a boundary carries its Aggregate component type, its uses-edges (cross-boundary edges marked), and its Feature attachments with their slot, sensitivity and provenance clauses. `--flat` collapses the boundary tree to one section per boundary keyed by its full path. `--raw` emits the Release file verbatim with no pipeline.

### YAML output

```text
$ aggrega inspect core/server:1.0.0 --output yaml --catalog ./catalog

apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
    name: core/server
    version: "1.0.0"
    labels:
        component.aggrega.ai/type: server
spec:
    schema: |
        values: { port?: int | *8080 }
    usesSchema:
        db:
            selector: 'component.aggrega.ai/type=stateful-server'
```

## Machine-readable output

`--output yaml` emits the render subject — the as-authored entity for catalog kinds, the resolved structure for instance kinds — as YAML, suitable for piping and diffing. For a Release the render subject is the compiled graph, so `aggrega inspect <release> --output yaml` is how that graph is read from the command line; an editor integration reads the same graph over the daemon's protocol.

**Every one of these outputs is verbatim, and that includes values an author declared sensitive.** The text layouts replace such a value with `<redacted>`; the machine-readable ones do not, deliberately. They exist to be parsed and diffed, so an output that withheld part of itself would misrepresent the input it claims to reproduce and would break the round-trip its consumers depend on. Declaring a leaf sensitive is not sufficient to keep it out of them — the compiled graph carries the authored `values` as it received them, encoded rather than hidden. Pipe, store and share these outputs the way you would the Aggregate and Release files themselves.

## Attachment slot and sensitivity clause

Each Feature attachment in the Release view carries a clause naming two facts the compiler derives about the attachment itself: which attachment slot it fills, and whether it handles declared-sensitive material. The clause sits between the attachment's name and its provenance bracket, and it reads identically in both provenance forms below.

- **`[slot: <name>]`** — the attachment fills the host Component's `featuresSchema` slot called `<name>`. A slot is filled by attaching a Feature under the slot's own name, so `<name>` is the attachment's name matched against the resolved Component's declared slots.
- **`[free]`** — the attachment fills no declared slot: the resolved Component declares no `featuresSchema` slot of that name. This is a finding, not a diagnostic. A free-form attachment is accepted, and an operator who wants to forbid one expresses that as a governance policy rather than relying on the tool to refuse it.
- **`[sensitive]`** — the attachment handles material an author declared sensitive, because the attached Feature declares a sensitive leaf, because the slot it fills declares `sensitive: true`, or both.

When both facts apply they share one clause. `core/storage/minio` declares a `root_password` slot marked `sensitive: true`, so a credential attached under that name reports both facts, while a Feature attached under a name the Component declares no slot for reports neither slot nor sensitivity:

```text
    Features:
    - root_password (core/generated-secret:1.0.0)    [slot: root_password, sensitive]    [explicit]
    - cross-namespace-routing (core/k8s-dns-resolver:1.0.0)    [free]    [explicit]
```

The clause is omitted entirely when neither fact applies, and each half is omitted independently:

- **No slot half** means the host Component's declared slot set could not be resolved — for instance, its type matches no catalog entity. This is deliberately distinct from `[free]`: `[free]` answers "no slot of that name is declared", while an absent half means the question could not be answered at all.
- **No `sensitive`** records that no declaration marked the attachment. That is narrower than a verdict that the attachment carries nothing secret; the axis reports declarations, and nothing is inferred from a field's name or its value.

A slot whose declared name is literally `free` renders as `[free]` too, indistinguishable from a free-form attachment — nothing reserves that word against the slot namespace.

## IR provenance bracket grammar

Each Feature attachment in the Release view carries a provenance bracket. The bracket can take a compact form (one bracket per Feature when the attachment's provenance is uniform across all leaves) or a per-leaf form (one bracket per leaf when the attachment's leaves come from heterogeneous sources). Three bracket bodies exist; they apply identically to both forms.

### The three bracket bodies

- **`[explicit]`** — the Feature attachment is **author-declared**. The Aggregate or Release explicitly named the Feature on the affected node. Explicit attachments are the highest-priority source; they always win over annotation-driven contributions at the same leaf.

- **`[annotation: <key> from <source>]`** — the Feature attachment is **annotation-driven**. The compiler synthesized it because an annotation on `<source>` matched a Manifest binding declaring this Feature. `<key>` is the annotation key that fired the binding (e.g., `business.aggrega.ai/team`); `<source>` is the entity that carried the annotation (`aggregate`, `release`, `component`, or `manifest`). The synthesized attachment is structurally identical to an explicit one — downstream rendering treats both the same way — but the provenance bracket distinguishes them so debugging stays decidable.

- **`[explicit; overrides annotation: <key> from <source>]`** — a per-leaf form that fires when an **explicit author declaration** at one leaf is suppressing an **annotation contribution** that would otherwise have set the same leaf. Cross-side composition produces this case: an Aggregate annotation might supply a Feature's `values:` pillar, a Release annotation supplies its `infra:` pillar, and an explicit Release declaration on the same Feature overrides one infra leaf. The leaf bracket records both the explicit author and the annotation that was suppressed; the suppressed annotation does not contribute to the rendered output, but its presence appears in the inspect view so the operator can see which annotation was overridden and where.

### Compact form vs per-leaf form

The compiler chooses between compact and per-leaf rendering by walking the attachment's per-leaf provenance and checking uniformity. An attachment's provenance is **uniform** when every populated leaf (across the Feature's `values:` and `infra:` pillars) shares the same origin (explicit vs annotation), the same annotation key when annotation-driven, the same source entity, and no leaf carries an "overrides annotation" marker. When provenance is uniform, the compiler emits one bracket per attachment:

```text
- core/rate-limiter     [annotation: business.aggrega.ai/team from aggregate]
```

When provenance **diverges** — a typical case is cross-side composition, where an Aggregate annotation supplies `values:` and a Release annotation supplies `infra:` on the same Feature — the compiler emits one bracket per populated leaf:

```text
- core/data-masking
    values.fields_to_mask: ["ssn", "card_number"]     [annotation: compliance.aggrega.ai/data-class from aggregate]
    values.classifier_endpoint: "redact-v2"            [explicit; overrides annotation: compliance.aggrega.ai/data-class from aggregate]
    infra.audit_bucket: "s3://..."                     [annotation: compliance.aggrega.ai/audit-bucket from release]
```

The walk order is values pillar first (in author order), then infra pillar (same discipline). The pillar prefix (`values.` / `infra.`) and the dotted path inside the pillar pinpoint exactly which leaf each bracket annotates.

## Declared-sensitive values

A leaf whose schema declares `sensitive: true` prints the fixed text `<redacted>` in place of its value. The key, the pillar prefix and the provenance bracket are all kept — only the value is replaced — so the layout still answers which leaves an entity carries and where each came from. Two surfaces are affected: an Aggregate's per-node `Values:` block, and a resolved Release's per-leaf attachment block.

```text
Components:
  app  (type: core/app)
    Values:
      appName: demo
      dbPassword: <redacted>
      tuning.poolSize: 25
      tuning.adminToken: <redacted>
```

Only a declared leaf is withheld, and the attachment-level `[sensitive]` clause is not a withholding instruction: it says the attachment handles secret material, not which of its leaves carry it. A credential Feature's published locators — the resource name and the data key — are public and are deliberately left undeclared in the standard-library catalog, so they print in the clear beside the material that does not:

```text
- credentials (feature.test/db-credential)
    values.secretName: db-creds              [explicit]
    values.literalPassword: <redacted>       [annotation: feature.test/pw from aggregate.yaml:components.app.annotations.feature.test/pw]
```

Nothing is inferred from a field's name: a field called `password` that carries no declaration prints its value, and a declared field called `key` does not. Redaction covers what the tool prints; it never reaches a rendered artifact, and `dist/` is emitted exactly as the render produced it. The keyword and the full ceiling on what declaring it achieves are at [`vocabulary/compact-form-authoring.md`](../vocabulary/compact-form-authoring.md) "Declaring a leaf sensitive".

## When to reach for inspect

- **Debugging "why is this Feature here?"** — annotation-driven attachments are invisible in the Aggregate and Release YAML files (the annotations are there, but the Feature attachments they synthesize live only in the IR). Inspect surfaces them with provenance.
- **Verifying schema inheritance** — `aggrega inspect <ComponentName>` shows the merged schema after the `extends:` chain resolves; the authored file alone shows only the local delta.
- **Diagnosing cross-side composition surprises** — when an Aggregate annotation and a Release annotation both supply pillar payloads on the same Feature, the resolved leaves can be confusing to reconstruct mentally. The per-leaf bracket form makes the resolution explicit.
- **Pre-deployment verification check** — `aggrega inspect ./prod-release.yaml` lists every Feature on every Component before `aggrega build` produces artifacts; the operator can confirm the topology matches intent before committing the rendered manifests to GitOps.

For the underlying mechanics — how annotations cascade, how the side-vs-pillar partition routes annotation values into Feature pillars, and how the explicit-attachment-wins discipline interacts with annotation-driven contributions — see [providers/well-known-annotations.md](../providers/well-known-annotations.md) and [entities/manifest.md](../entities/manifest.md) "Annotation-Driven Feature Bindings".

<!-- BEGIN GENERATED: cli-inspect -->
**Synopsis**

```
aggrega inspect [identifier] [flags]
```

**Flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--catalog` | `[]` | Catalog directory; repeatable. Each --catalog is prepended to the workspace catalog_dirs search stack (first match wins). Defaults to the current directory. |
| `--color` | `auto` | Colorize output: auto\|always\|never. |
| `--detail` | `false` | Render full field bodies. |
| `--flat` | `false` | Render a tree-shaped entity (Aggregate, Release) as a flat list, each node prefixed with its full dotted path. No effect on tabular kinds. |
| `--list` | `false` | Render identifiers only. |
| `--no-color` | `false` | Disable colorized output (alias for --color=never). |
| `--output`, `-o` | `text` | Output format: text\|yaml. |
| `--plugin` | — | Filesystem path to a raw .wasm artifact; derives and prints the host functions it imports, before `aggrega plugin sync` records them in a Plugin entity. Takes no identifier argument. |
| `--raw` | `false` | Render the entity as authored, without resolution. |
| `--resolved` | `false` | Render the entity fully resolved. |
| `--show-implements` | `false` | For a Recipe or FeatureRecipe, resolve spec.implements against the catalog and render the bound Component or Feature. |
<!-- END GENERATED: cli-inspect -->
