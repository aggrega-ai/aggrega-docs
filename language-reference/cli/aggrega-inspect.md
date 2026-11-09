# aggrega inspect

`aggrega inspect` renders a human-readable view of any Aggrega entity — a catalog Component, an authored entity file, an entity published in a registry, or a fully-resolved Release. It is the canonical debug surface for understanding what the compiler will produce: which Components extend which bases, which Recipe maps to each type, which Features attach to each node, and exactly where each Feature's contributions came from.

Each entity kind has a natural "contract" view. `inspect` shows that contract — the schema a Component publishes, the mappings a Manifest declares, the topology an Aggregate builds, the per-node Feature attachments a Release resolves to. Tutorial and conceptual material lives elsewhere; `inspect` answers "what does this entity actually resolve to?"

A single positional argument routes by content shape; no subcommand is needed. The command dispatches per the following heuristic:

| Identifier shape | Dispatch | Output |
| --- | --- | --- |
| Starts with `./`, `../`, or `/`, or ends with `.yaml` / `.yml` | **File branch** | Per-file inspection keyed off the file's `kind:` header. |
| Starts with `oci://` | **Registry branch** | The entity published at that coordinate, read from its registry and rendered by the view a file of its kind gets. See [Reading a published entity](#reading-a-published-entity). |
| Anything else | **Catalog branch** | Look up the identifier in the catalog search stack across every entity kind; resolve `extends:` chains; render the matched kind's own view. |

## Three detail levels

`--list`, the default, and `--detail` form a uniform three-level verbosity discipline that every kind honors. `--list` and `--detail` are mutually exclusive — passing both is refused rather than silently resolved.

- **`--list`** — identifiers only. A Component lists its name and its uses-socket names; a MappingLibrary lists its mapping names; an Aggregate lists its component names with their types.
- **default** — a structured overview tuned for interactive use. It opens with the entity's identity and, for every kind but a Manifest and a Release, with its description where the entity authors one; an entity with no description prints none rather than an empty line. The rest of the shape is per-kind: a Component shows its schema and sockets; an Aggregate shows components, their values and edges with the attachments each connection carries, and the dependency graph; a Release shows the per-boundary node tree with Feature attachments, each one written on a connection listed beneath that connection.
- **`--detail`** — full field bodies. Everything the kind carries: a Component adds its self-inject mechanisms, required Features, and labels; a MappingLibrary expands each mapping's full template body; a Recipe adds its workload body, provides, and assertions.

A few kinds use the levels to surface progressively more of an authored body. A MappingLibrary at `--list` shows mapping names; at the default level it adds each mapping's synthesized usage example; at `--detail` it expands the full template body.

## Resolution: `--raw` and `--resolved`

Each kind has a natural default resolution depth (see the table below). `--raw` and `--resolved` are always-available overrides, and they are mutually exclusive — passing both is refused rather than silently resolved:

- **`--raw`** opts out of all resolution — the entity is emitted as authored, straight from the file.
- **`--resolved`** opts in to the kind's full resolution depth.

For kinds that default as-authored, `--raw` is a no-op and `--resolved` triggers what resolution the kind supports. For kinds that default resolved, `--raw` is the as-authored bypass.

`--raw` reproduces the file, so a value an author declared sensitive appears in it exactly as authored. That is the contract, not a gap — an as-authored view that quietly withheld part of itself would not be as-authored. Handle `--raw` output the way you handle the entity file it came from. `--output yaml` reproduces the file the same way, for every kind including a Release.

A Release answers two further questions, and each is a different document with its own flag. The compiled graph a Release resolves to is `--ir-graph`; its dependency closure is `--closure`. See [Machine-readable output](#machine-readable-output) and [The dependency closure: `--closure`](#the-dependency-closure---closure) below.

## Per-kind defaults

`inspect` knows the standalone-inspectable kinds in the table below. The catalog kinds render as-authored by default — their files are self-contained contracts. The instance kinds default to a resolved view, because their authored YAML is only the starting point for a cascade or a pipeline.

| Kind | Default | What "resolved" means |
| --- | --- | --- |
| Component | as-authored | The file is a self-contained contract; resolution is against a Manifest binding, surfaced via `--show-implements`. |
| Feature | as-authored | Same as Component. |
| Recipe | as-authored | `--show-implements` resolves the `spec.implements` Component reference. |
| FeatureRecipe | as-authored | `--show-implements` resolves the `spec.implements` Feature reference. |
| MappingLibrary | as-authored | Entries are opaque Go-template strings; rendering happens at consumption time. |
| SchemaLibrary | as-authored | Entries are reusable schema and template definitions resolved at consumption time. |
| WorkloadLibrary | as-authored | Entries are reusable Workload bodies a Recipe imports, evaluated at consumption time. |
| ArtifactLibrary | as-authored | Entries are reusable artifact bundles a Recipe imports, rendered at consumption time. |
| Plugin | as-authored | The file is a self-contained plugin contract: socket types, per-export capabilities, runtime constraints, and signature pointer. Addressable by file path, or by its `<pluginType>/<name>` coordinate against the catalog. |
| Manifest | resolved | The `extends:` chain is applied; the resolved component and feature mappings are laid out. |
| Aggregate | resolved | The topology is built — the uses-graph and ordering are computed. |
| Release | resolved | The full pipeline runs: resolve, expand annotations, run guards, build topology, build IR. |

A file whose `kind:` is `Workload` is rejected: a Workload exists only embedded in a Recipe and is not a standalone inspectable entity. Inspect a Recipe to see its Workload.

## Resolution depth per kind

Most kinds have no pipeline — `inspect` reads the file and renders it. Three instance kinds resolve meaningfully:

- **Manifest** applies its `extends:` chain — file-import following — and renders the merged component and feature mappings. `--raw` shows the file as authored.
- **Aggregate** builds its topology: the uses-graph is constructed and the dependency ordering is computed. The default view shows components with their values and edges, followed by the dependency graph. `--raw` shows the authored subsystem tree.
- **Release** runs the entire compilation pipeline up to the IR — resolve, expand annotations, run guards, build topology, build IR — and renders the per-boundary node tree with each node's Feature attachments and their provenance. The governance attachments that shape the graph run in that pipeline rather than being skipped for a view, so what you read reflects what they decided: a `label-transform` attachment's labels are in place before anything is matched against them, and an `annotation-transform` attachment's injected annotations expand into Feature attachments exactly as an annotation you authored does. An attachment whose plugin this command cannot resolve stops it, rather than leaving you a graph drawn without that plugin's decisions. A Release that extends another is drawn, in this view and in `--ir-graph`, as the Release its `extends:` chain composes to — the one a build of it reads — so a Release naming only its parent shows that parent's Aggregate, Manifest and boundaries under its own name. The Manifest a Release names is composed through its own `extends:` chain too, whether or not the Release extends anything, so an attachment whose mapping that Manifest inherits shows the realization a build uses. `--raw` emits the Release file verbatim with no pipeline. `--closure` asks a different question about the same Release and runs no pipeline at all; see [The dependency closure: `--closure`](#the-dependency-closure---closure).

There is no separate depth flag; the `--raw` / `--resolved` toggle is the only resolution control, layered on each kind's natural default.

## Error behavior

A referenced sibling file that fails to load stops the command at once — a Release pointing at a missing Aggregate, a broken catalog entity in the search stack. It stops with a clear message rather than rendering partial output, and there is no continue-on-error mode for a load failure: once a document the resolution needs is unreadable, there is nothing further to resolve. Where resolving a name stops on one catalog document the load refuses, the message states that refusal once: a head carrying the category and, where the refusal names a condition, its short code, then the document, then what is wrong with it — for a document its kind's schema refuses, the line and the constraint it violates. It carries no suggestion to move the file — the catalog read it, which is why it was refused.

**A Release whose composition the compiler's checks reject is refused rather than rendered.** Resolving a Release builds the graph, and the checks a build makes over the finished graph — a `uses:` edge whose target does not satisfy its socket's `selector:`, a Feature attached to a component its `appliesTo:` does not admit, and the rest — are made here too, with the diagnostic a build of the same documents prints. The refusal names every finding in one run rather than stopping at the first, so one pass shows you the whole list to correct rather than the first entry of it. That is what keeps this command honest about a deployment: a view that rendered a composition the build refuses would report a workspace as fine while it is not. The selections that resolve nothing are unaffected — `--raw`, `--output yaml` and `--closure` reproduce or resolve what you authored without building a graph.

**A Release whose lockfile no longer matches what it resolves to is refused with the halt `aggrega build` prints.** Where a lockfile sits beside the Release, every selection that resolves the Release — the default view, `--resolved`, `--ir-graph` and `--closure` — holds it to what the Release resolves to, with the drift comparison a build runs before it renders. A lockfile that no longer matches stops the command with the build's `E0130` refusal: every entry that drifted, then the `aggrega pull --release <release>` that clears it. Nothing is written to standard output and the command exits non-zero, because a picture drawn from the catalog as it stands would show what no build of that Release renders. `--raw` and `--output yaml` on their own read neither the lockfile nor the catalog, and are not held to it. A Release with no lockfile beside it is resolved over the catalog as it stands.

A file whose `kind:` is unrecognized reports the unknown kind and the file it came from. A `Workload` file reports that the kind is embedded-only and names the entity it embeds under. An `oci://` identifier that cannot be read is refused with the condition that names why; [Reading a published entity](#reading-a-published-entity) lists them.

## Catalog resolution

The catalog search stack is assembled with a layered precedence: `--catalog` flags (prepended, in order) come first, then the workspace's `catalog_dirs` from `.aggrega-config.yaml` — for a Release the configuration gives directories of its own under `workspace.releases`, that Release's in their place — then the `catalog` directory at the workspace root, which is read whether or not anything names it. A workspace whose `catalog_dirs` is written as an empty list reads no local catalog at all. The stack is first-win — the earliest directory to declare an entity identity owns it; a later directory's copy is shadowed. The catalog branch resolves the identifier against this stack across every entity kind, in a fixed precedence, and renders the first match through that kind's own view; the file and release branches load referenced catalog entities from it when a Manifest mapping or `extends:` parent must be resolved. An `extends:` parent the stack does not hold is read where a build reads one: from the artifact cache, under the pin a Release's lockfile records for it — the named Release's, or every Release the workspace holds where none is named. So a base published to a registry resolves here once [`aggrega pull`](aggrega-pull.md) has fetched and pinned it, and before that the command is refused naming `aggrega pull --release <release>`. Nothing is fetched.

### Looking a name up in a Release's terms

A name given on its own is looked up in the workspace's own stack. Give `--release <release-path>` beside it and the name is looked up in that Release's stack instead — the directories the workspace configuration gives that Release, with any `--catalog` prepended — which is what a build of that Release reads. A workspace that keeps one catalog variant per Release, each declaring the same entity, therefore answers a name with the variant that Release builds with:

```
aggrega inspect core/datastore/mariadb --release release-helm-synth.yaml
```

A name that Release's stack does not resolve is refused, and the account of where local entities are read from names that Release's entry under `workspace.releases`, since that entry is what the lookup read. `--release` chooses the stack a name is looked up in, so it applies to a name alone: a file path and a registry reference are read as they stand and refuse it. A `--release` naming a file that does not exist, or naming a directory, is refused before anything is looked up.

## Reading a published entity

`aggrega inspect oci://<host>/<repository>:<tag>` reads the entity published at that coordinate; `@<digest>` in place of `:<tag>` names one manifest exactly. It is how you look at an entity that exists only in a registry — the repository is the kind segment followed by the entity's identity, as [Catalog and Registry](../../architecture/13-catalog-and-registry.md) §6 lays out, and `aggrega push` prints the reference it published at, which reads here with `oci://` in front of it.

**What you see is the entity as it was published.** An entity published with the files it declares — a Recipe with its local chart or its lock, a Component with a schema it imports — ships as an archive, and the entity is unpacked from it: the document at the archive's root that declares a publishable kind, so a chart template or a compose fragment shipped beside it is not mistaken for it. An entity that declares no file ships as its document unchanged, and a Plugin's entity is read from its manifest rather than from the executable published with it. The document is then rendered by the same view a file of that kind gets, with the same detail levels and the same `--raw` and `--output yaml`. No inheritance is applied: the view is of what the publisher put at that coordinate. The readable layouts end with what was read: the coordinate, whether it held the entity as an archive or as the document itself, the media type its manifest declares, and the digest of that manifest, which reads the same bytes again when written as `@<digest>` in place of `:<tag>`; `--output yaml` prints the document and nothing after it.

**What it checks, and what it does not.** The fetched bytes are checked against the digest the artifact's own manifest records for them, which establishes that they are the bytes that manifest names. That is a check against what the registry served rather than against anything recorded beforehand: no signature attached to the artifact is verified, and no withdrawal recorded against it is reported. Nothing is written — no cache entry and no lockfile — so reading a coordinate changes nothing a later build resolves.

**It reaches the network.** The registry is contacted with the credentials this machine holds for it, from the same store `aggrega push` and `aggrega pull` read, and a registry on this machine is contacted over plain HTTP. A workspace that is offline refuses the read before anything is dialled.

**A read that cannot answer exits non-zero and prints nothing on standard output.** Each failure below names its condition together with what to do about it; a registry that cannot be reached at all is reported with the network error that stopped the read:

| What happened | Condition |
| --- | --- |
| Nothing is published under the reference | `E0137` |
| The registry refused the credential, or none is stored for it | `E0138` |
| The workspace is offline | `E0125` |
| The artifact is an archive that cannot be unpacked | `E0300` |
| The archive carries no entity document at its root | `E0298` |
| The archive carries more than one entity document at its root | `E0299` |
| The document is not an entity of a kind a registry publishes | `E0301` |

Each code is listed in the [error reference](../errors/sentinels.md). A reference that names no repository, or neither a tag nor a digest, is refused with the form to write instead. `--ir-graph` and `--closure` are refused before anything is fetched, because no kind a registry publishes is a Release.

## Deprecation and withdrawal notices

A publisher can record a marker against an artifact after publishing it, stating that the published version is deprecated or withdrawn. When the catalog branch resolves an entity, `inspect` reports any such marker beneath the entity's own view — for every kind it resolves by name, not only for a Component.

The notice names the severity the publisher recorded — `warning`, `error` or `retracted` — together with the version the marker was recorded on, the reason, the replacement where one is named, and the date it was issued. All three severities are reported. That is wider than the set which changes what a build resolves to: a version marked `retracted` is excluded from version selection, while `warning` and `error` are advisory and still selected. `inspect` shows you what a publisher said; it does not decide what you get.

The notice is read from the local index of the registry the entity resolves from, which `aggrega registry update` builds — so it needs no network and works in an offline workspace. Because the index is a snapshot, the notice ends by stating when that snapshot was taken and names the command that refreshes it. A workspace with no index built reports nothing, and an absent notice therefore means "nothing recorded in this snapshot" rather than "nothing recorded".

A marker is reported only when its own signature verifies against the signers the registry's trust policy honors. An unsigned marker, or one whose signature does not verify, is not reported: a claim that cannot be authenticated is not presented as fact.

The notice accompanies the human-readable views. Neither `--output yaml` nor `--ir-graph` appends one, so a consumer parsing either receives a document and nothing else.

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

The default view shows the Component's description where it authors one, then the resolved schema (after any `extends:` merge) and the declared uses-sockets. The Component above authors no description, which is why the transcript opens straight at the schema. `--detail` adds the self-inject mechanisms, required Features, and labels; `--list` shows just the Component identifier and its socket names.

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

A connection written in the long form is followed by the attachments it carries, each under the name it takes on the consuming component — the connection's alias and the slot joined by a dot — with the Feature type it names and a clause giving the slot it fills and whether it handles declared-sensitive material:

```text
  gateway  (type: conn/gateway)
    Values:
      region: eu
    Uses:
      models:
        - gpt → model
            - gpt.credential (feature.conn/token)    [slot: credential, sensitive]
```

The slot and the mark are the facts a build of a Release deploying this Aggregate records for the attachment, read the same way the Release view reads them (see [Attachment connection, slot and sensitivity clause](#attachment-connection-slot-and-sensitivity-clause)); they come from the socket's slot declaration and the Feature's own, so they do not depend on which Release deploys the Aggregate. An Aggregate names no Manifest, so the realization a Release's Manifest chooses for the attachment is not shown here. This view lists a component's connections and what they carry; the attachments of a component's own block appear in the Release view.

### Release (resolved by default)

The Release view is the highest-stakes inspection. It runs the full pipeline and renders, per boundary, every Component node, its uses-edges, and every Feature attached to that node — one written on a connection beneath that connection's edge — each with the **attachment slot it fills**, whether it handles **declared-sensitive** material and the **FeatureRecipe that realizes it**, plus a **provenance bracket** revealing where the attachment came from:

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
    - cross-namespace-routing (core/k8s-dns-resolver:1.0.0)    [free, realization: k8s-dns-patcher:1.0.0]    [explicit]

Boundary: data-ns
  Directory: ./dist/data
  Annotations (provider-consumed):
    aggrega.ai/namespace: database-zone
  Component: data.main-db  (type: core/datastore/postgres:1.0.0)
    Features: (none)
```

Each boundary carries its output directory and its provider-consumed annotations; each component under a boundary carries its Aggregate component type, its uses-edges (cross-boundary edges marked), each followed by the attachments that connection carries, and its own Feature attachments, every attachment with its facts clause and provenance bracket. `--flat` collapses the boundary tree to one section per boundary keyed by its full path. `--raw` emits the Release file verbatim with no pipeline.

### YAML output

```text
$ aggrega inspect core/server:1.0.0 --output yaml --catalog ./catalog

apiVersion: aggrega.ai/v1beta1
kind: Component
metadata:
    name: core/server
    version: 1.0.0
    labels:
        component.aggrega.ai/type: server
spec:
    usesSchema:
        db:
            selector: component.aggrega.ai/type=stateful-server
    schema:
        values:
            port: {type: integer, default: 8080}
```

A Component named from the catalog is printed as the entity the catalog resolved, so after an `extends:` merge you see the merged entity rather than the authored file; a Component file is printed as authored.

## Machine-readable output

Two flags produce machine-readable output, and they answer different questions. `--output` picks a **format** for the document this command already renders; `--ir-graph` asks for a **different document** — the compiled graph a Release resolves to — in addition to it. They are independent: passing both gives you the graph and the as-authored YAML, each once.

`--output yaml` emits the entity as authored, suitable for piping and diffing. **That output is verbatim, and that includes values an author declared sensitive** — an output claiming to reproduce the input cannot withhold part of it and still be reproducing it. Pipe, store and share it the way you would the entity file it came from.

### The compiled graph: `--ir-graph`

`aggrega inspect <release> --ir-graph` writes the graph the run resolved to standard output as JSON, ahead of the view the command renders anyway. One JSON document, one trailing newline, so a consumer that decodes the stream reads the graph and stops.

It applies to a Release, which is the only kind that resolves to a graph. Asked of any other kind, or of a catalog entity by name, the command refuses and says so rather than rendering that entity's own view and quietly dropping the request.

**A composition the compiler's checks reject produces no graph.** The refusal described under [Error behavior](#error-behavior) happens before anything is written to this stream, so a pipeline reading it never receives a graph a build of the same documents would refuse — it receives the same findings a build would report, and a non-zero exit.

The same flag, with the same meaning, is on [`aggrega build`](aggrega-build.md) and [`aggrega validate`](aggrega-validate.md): each hands back the graph that run computed, in addition to whatever else that command produces. An editor integration reads the same graph over the daemon's protocol.

**`--output yaml` does not emit the graph.** It reproduces the authored Release, exactly as it does for every other kind. A pipeline that wants the graph reads it from `--ir-graph` instead, and receives JSON rather than YAML.

**The graph withholds.** It is not a file anyone wrote — it is what the compilation computed from the Aggregate, the Release and the catalog — so there is no as-authored contract to keep, and the same declarations that govern the readable layouts govern it. Wherever the graph carries a leaf an author declared sensitive, the value is replaced by a single-key object naming it as withheld:

```json
"values": {
  "secretName": "db-creds",
  "vault": {
    "token": { "aggrega_withheld": "declared" }
  }
}
```

The key survives, so the graph still answers which leaves a node and its attachments carry; only the value is gone. An undeclared sibling in the same payload is emitted as authored — `secretName` above is a public locator its author left undeclared, and it prints. The reason accompanying the marker says why the value is absent: `declared` for a leaf a declaration covers, and `unreadable` where the payload arrived in a shape this command could not read, in which case the whole payload is withheld rather than any part of it guessed at.

A connection's own configuration is withheld the same way. The per-connection `values` an Aggregate writes on a `uses` entry and the per-connection `infra` a Release writes on one are governed by the **consuming component's socket** — the `valueSchema` and `infraSchema` it declares, the contracts that configuration is validated against — never by the target's declarations. A leaf either contract declares `sensitive: true` is replaced by the marker in the edge's `values` and `infra`, and in the consuming node's `uses` entry, which carries the values as the author wrote them; each edge lists the leaves it withholds under `sensitive_payload_leaves`, the field a node uses for its own. A leaf of the same name on a connection whose socket declares it readable is emitted as written.

Pass `--unredacted` where a pipeline genuinely needs the values, and treat what it produces the way you treat the entity files themselves. [`aggrega build`](aggrega-build.md) and [`aggrega validate`](aggrega-validate.md) take the same flag beside `--ir-graph`, on the same terms: the graph they hand back withholds unless it is passed.

The daemon's protocol hands out the same graph under the same rule. [`aggrega/irGraph`](aggrega-serve.md) answers with these values withheld, and returns them in the clear only to a request that sets its `unredacted` field — the protocol's spelling of this flag. So what an editor panel draws follows the same declarations, and a client that shows the values does so because it asked for them.

## The dependency closure: `--closure`

`aggrega inspect <release> --closure` reports the Release's dependency closure: every catalog entity it reaches, at the version each resolved to, together with the Aggregate and Manifest identities its two pointers resolved to and the shared documents those entities draw on. Nothing is rendered and no artifact is produced — the closure is resolved, not built, so no provider is loaded to answer it.

**The closure and the resolved view are different documents, and neither is recoverable from the other.** The resolved view — what this command renders for a Release by default — says what the deployment looks like: its boundaries, its component nodes, what is wired to what, and what is attached to each node. The closure says what was pulled in to build it, and at which versions. An entity can be reached without ever appearing as a node — the Recipe a Manifest maps a component type to is reached by every build and is a node in none of them — and a node records the component type it was declared as, not the version that type resolved to. So a reader asking "why did this version move?", "what would changing this shared document affect?" or "what does this deployment actually depend on?" is asking for the closure, and a reader holding the resolved view does not already have it by reading harder.

**The same word asks for the same document on every surface.** `--closure` here, `aggrega/releaseClosure` over the daemon's protocol (see [`aggrega serve`](aggrega-serve.md) "A closure is not the graph"), and the release mode of the `describe` tool over the assistant tool protocol all answer this question about a Release; a Release name over any of them reaches the same resolution, so the three cannot come to disagree about what a Release depends on. Over a lockfile that no longer matches what the Release resolves to, this command and the `describe` tool refuse with the build's drift halt; the daemon, which serves an editor as it edits, answers.

**It is one document, so it is asked for on its own.** `--closure` selects the closure in place of the resolved view, and it cannot be combined with `--raw`, `--resolved`, `--output` or `--ir-graph` — each of those asks for a different document about the same Release, and a command that accepted two requests would have to silently answer one of them. Combining them is refused, naming the pair.

**It applies to a Release and to nothing else.** A catalog entity, an Aggregate file, a Manifest — none of them resolves a closure, so the request is refused rather than answered by rendering that subject's own view and dropping it. A dropped request reads to the caller exactly like a subject whose closure is empty.

**Each outcome is told apart.** A Release that resolves is answered with the listing. A Release path that names no file is refused, saying the file is not there. A Release that is there and whose closure cannot be resolved is refused with what could not be resolved and where the reference came from, followed by any files the catalog load refused — because a refused file is the usual reason an entity the Release reaches went missing. A [plugin trust record](aggrega-pull.md#the-plugin-trust-record) beside the Release that is there and cannot be read is refused with what could not be read, because a listing that passed over it would report no withdrawn plugin where none could be checked. A Release whose lockfile no longer matches what it resolves to is refused with the drift halt a build prints, as [Error behavior](#error-behavior) describes, because the versions listed would be ones no build of that Release uses. An empty listing is never the answer to any of them: it would report a mistyped path, or a broken workspace, as a Release that depends on nothing.

The three verbosity levels apply as they do to every kind. `--list` prints the references alone, one per line, for piping. The default adds the resolved identities, the version each reference resolved to, the shared documents drawn on, any Manifest mapping whose target does not implement the type it is mapped to, and any deprecation or withdrawal notice recorded against what the Release depends on — in its lockfile, against a pinned reference, and in the plugin trust record beside it, against a plugin attached in a role that returns an accept-or-reject verdict — in the words `aggrega build` prints for the same marker. `--detail` adds the kind of each reference where the reference site recorded one — some positions in a document say what kind they point at and others do not, so it is reported where it is known rather than guessed from the shape of the name.

```text
$ aggrega inspect ./release.yaml --catalog ./catalog --closure

Release: prod-release:1.0.0
  Aggregate: fullstack-app
  Manifest: prod-manifest
  Environment: production

Entities (11):
  ./aggregate.yaml
  ./manifest.yaml
  core/compute/api-server (1.0.0)
  core/compute/web-ui (1.0.0)
  core/datastore/postgres (1.0.0)
  core/k8s-dns-resolver (1.0.0)
  db-module (1.0.0)
  helm-api-server-synthesized-with-artifacts:1.0.0 (1.0.0)
  helm-postgres-synthesized-with-artifacts:1.0.0 (1.0.0)
  helm-web-ui-synthesized-with-artifacts:1.0.0 (1.0.0)
  k8s-dns-patcher:1.0.0 (1.0.0)
```

Where a workspace has recorded which versions a Release resolves to, that record seeds the resolution, so the versions reported are the ones this deployment is built from rather than whatever the catalog happens to hold today. A workspace with no such record resolves over the catalog as it stands.

## Attachment connection, slot and sensitivity clause

Each Feature attachment in the Release view carries a clause naming the facts the compiler records about the attachment itself: which attachment slot it fills, whether it handles declared-sensitive material, and the FeatureRecipe that realizes it — and, for an attachment written on one of the component's connections, the connection it was written on. The clause sits between the attachment's name and its provenance bracket, and it reads identically in both provenance forms below.

An attachment written on a connection is listed beneath that connection's line in `Uses:`, not under `Features:`, so `Features:` holds the component's own attachments alone. The line above it names the connection by its alias and the component it reaches, and its own clause says the rest:

- **`[socket: <socket>]`** — the socket the connection is wired through, which the connection's line does not name. It leads the clause because it changes how the rest reads: the slot half that follows names a slot the connection's socket declares, not one the component declares for its own attachments.
- **`[connection: <alias> through socket <socket>]`** — the same fact for an attachment whose connection the `Uses:` block shows no line for, which is then listed under `Features:` and names its connection here instead. Either way a connection is named once per attachment, never twice.
- **`[slot: <name>]`** — the attachment fills the slot called `<name>`. A slot is filled by attaching a Feature under the slot's own name, so `<name>` is the name the attachment was written under, matched against the declared slots: the host Component's `featuresSchema` for one of its own attachments, and the `featuresSchema` the connection's socket declares for an attachment written on a connection.
- **`[free]`** — the attachment fills no declared slot: the resolved Component declares no `featuresSchema` slot of that name. This is a finding, not a diagnostic. A free-form attachment is accepted, and an operator who wants to forbid one expresses that as a governance policy rather than relying on the tool to refuse it.
- **`[sensitive]`** — the attachment handles material an author declared sensitive, because the attached Feature declares a sensitive leaf, because the slot it fills declares `sensitive: true`, or both.
- **`[realization: <name>:<version>]`** — the FeatureRecipe the Release's Manifest binds for the attachment: by the attachment's own name where the Manifest maps that name — for an attachment written on a connection, the alias and the slot joined by a dot — otherwise by its Feature type. It is the realization a build of the same documents renders the attachment with, and the same value the compiled graph carries on the attachment as `realization` (see [`--ir-graph`](#the-compiled-graph---ir-graph)), so this view and the graph cannot name different ones. It comes last in the clause.

When several facts apply they share one clause. `core/storage/s3-object-store` declares a `secret_access_key` slot marked `sensitive: true`, so a credential attached under that name reports both facts, while a Feature attached under a name the Component declares no slot for reports neither slot nor sensitivity. With a Manifest that maps each Feature type to a FeatureRecipe, each line also names its realization:

```text
    Features:
    - secret_access_key (core/generated-secret:1.0.0)    [slot: secret_access_key, sensitive, realization: generated-secret:1.0.0]    [explicit]
    - cross-namespace-routing (core/k8s-dns-resolver:1.0.0)    [free, realization: k8s-dns-patcher:1.0.0]    [explicit]
```

A component whose `models` socket declares a `credential` slot marked `sensitive: true`, wiring a connection under the alias `gpt` that fills it, lists that attachment beneath the connection — beside a credential of its own, which stays under `Features:`:

```text
    Uses:
      gpt → model
        - gpt.credential (feature.conn/token:1.0.0)    [socket: models, slot: credential, sensitive, realization: conn-token-compose:1.0.0]    [explicit]
    Features:
    - db_password (feature.conn/token:1.0.0)    [slot: db_password, sensitive, realization: conn-token-compose:1.0.0]    [explicit]
```

An attachment written on a connection never reports `[free]`: a socket admits only the slots it declares, and a connection carrying any other name is refused when the build loads.

The clause is omitted entirely when none of the facts applies, and each half is omitted independently:

- **No socket or connection half** means the attachment was written on the component's own block, or reached it from a broader scope or by annotation-driven expansion.
- **No slot half** means the host Component's declared slot set could not be resolved — for instance, its type matches no catalog entity. This is deliberately distinct from `[free]`: `[free]` answers "no slot of that name is declared", while an absent half means the question could not be answered at all.
- **No `sensitive`** records that no declaration marked the attachment. That is narrower than a verdict that the attachment carries nothing secret; the axis reports declarations, and nothing is inferred from a field's name or its value.
- **No realization half** means the Manifest binds the attachment to no FeatureRecipe the catalog holds.

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
- core/pii-redaction
    values.fields_to_mask: ["ssn", "card_number"]     [annotation: compliance.aggrega.ai/data-class from aggregate]
    values.classifier_endpoint: "redact-v2"            [explicit; overrides annotation: compliance.aggrega.ai/data-class from aggregate]
    infra.audit_bucket: "s3://..."                     [annotation: compliance.aggrega.ai/audit-bucket from release]
```

The walk order is values pillar first (in author order), then infra pillar (same discipline). The pillar prefix (`values.` / `infra.`) and the dotted path inside the pillar pinpoint exactly which leaf each bracket annotates.

## Declared-sensitive values

A leaf whose schema declares `sensitive: true` prints the fixed text `<redacted>` in place of its value. The key, the pillar prefix and the provenance bracket are all kept — only the value is replaced — so the layout still answers which leaves an entity carries and where each came from. Two readable surfaces are affected: an Aggregate's per-node `Values:` block, and a resolved Release's per-leaf attachment block — including an attachment written on a connection, printed beneath that connection's line, which withholds exactly the leaves the same Feature withholds when the component holds it itself. A Release's compiled graph under `--ir-graph` withholds the same leaves in the structured form described at [Machine-readable output](#machine-readable-output).

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

### Showing the withheld values

`--unredacted` prints the declared-sensitive values instead of withholding them, on every `inspect` surface at once — the readable layouts above and a Release's compiled graph alike. It exists because the withheld value is sometimes the one being investigated: a credential arriving from the wrong attachment looks identical to the right one when both read as withheld.

It is scoped to the command it is passed to. [`aggrega build`](aggrega-build.md) and [`aggrega validate`](aggrega-validate.md) take it too, where it reaches the graph `--ir-graph` hands back and nothing else, and refuse it when no graph was asked for. `aggrega build --trace-unredacted` is the same idea on the build's trace files, and neither of the build's two flags reaches the other's output; a rendered artifact under `dist/` is unaffected by all of them, because it is emitted exactly as the render produced it whatever is passed.

Whatever the output reaches then carries those values in the clear — a terminal, a pipe, a file, a screen recording, a pasted bug report. Unlike the trace files, which each open with a header saying they were captured unredacted, output on a terminal carries no such marking: only the command line says it was passed.

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

**Description**

```
Render a readable view of any Aggrega entity — a catalog entity by name, an
authored entity file by path, an entity published in a registry, or a
fully-resolved Release.

It answers "what does this entity actually resolve to?": which entities extend
which bases, which Recipe maps to each type, which Features attach to each node,
and where each Feature's contributions came from.

A single argument routes by its shape. A path — anything starting with ./, ../
or /, or ending in .yaml or .yml — is read as a file and inspected by its own
kind: header. A registry reference — oci://<host>/<repository>:<tag>, or
@<digest> in place of :<tag> — is read from the registry that publishes it.
Anything else is looked up by name in the catalog search stack: the
workspace's own, or, with --release, the one the workspace configuration
gives that Release, so a name several catalog variants declare, one per
Release, resolves to the variant that Release builds with.

A registry reference shows the entity exactly as it was published: unpacked
from the archive its kind is published as where it is one, and rendered by the
same view a file of that kind gets. Reading it reaches the network, using the
credentials this machine holds for that registry, and an offline workspace
refuses it. The fetched bytes are checked against the digest the artifact's
own manifest records for them, which establishes that they are the bytes that
manifest names and nothing more: no signature attached to the artifact is
verified, no withdrawal recorded against it is reported, and nothing is
written — no cache entry and no lockfile.

Three verbosity levels apply to every kind: --list for identifiers only, the
default for a structured overview, and --detail for full field bodies. --list
and --detail are mutually exclusive. Resolution depth has its own pair, --raw
for the entity exactly as authored and --resolved for the kind's full depth,
also mutually exclusive.

Note that --raw reproduces the file as written, so a value the author declared
sensitive appears as authored. That is what as-authored means; handle such
output as you would the entity file itself. --output yaml reproduces the file
the same way for every kind, a Release included.

A Release answers two further questions, and each has its own flag because
neither answer contains the other. --ir-graph asks for the IR graph a Release
resolves to — what the Release looks like, as JSON on stdout in addition to
whatever else this command produces. --closure asks for the Release's dependency
closure — every catalog entity it reaches and the version each resolved to,
which is what was pulled in to build the Release. An entity can be reached
without appearing as a node, and a node does not carry the version its type
resolved to, so holding one of the two is not holding the other.

--ir-graph is orthogonal to --output, which picks the format of the command's
own view. Values an author declared sensitive are withheld from the graph, as
they are from the readable layouts. Pass --unredacted to print them instead.
```

**Flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--catalog` | `[]` | Catalog directory; repeatable. Each --catalog `<dir>` is prepended to the catalog search stack (first match wins): the workspace catalog_dirs, or, for a Release the workspace configuration gives directories of its own under workspace.releases, that Release's; the stack ends with the directory named catalog at the workspace root when there is one. A catalog_dirs list written empty reads no local catalog at all. |
| `--closure` | `false` | Report the Release's dependency closure — every catalog entity it reaches, at the version each resolved to — in place of the resolved-node view. Applies to a Release, which is the only kind that resolves a closure; any other kind refuses the request rather than silently dropping it. |
| `--color` | `auto` | Colorize output: auto\|always\|never. |
| `--detail` | `false` | Render full field bodies. |
| `--flat` | `false` | Render a tree-shaped entity (Aggregate, Release) as a flat list, each node prefixed with its full dotted path. No effect on tabular kinds. |
| `--ir-graph` | `false` | Also write the IR graph this run computed to stdout, as JSON, in addition to everything this command already produces. Values an author declared sensitive are withheld from it; pass --unredacted to print them instead. Applies to a Release, the one kind that resolves to a graph; any other kind refuses the request rather than silently dropping it |
| `--list` | `false` | Render identifiers only. |
| `--no-color` | `false` | Disable colorized output (alias for --color=never). |
| `--output`, `-o` | `text` | Output format: text\|yaml. |
| `--plugin` | — | Filesystem path to a raw `<file.wasm>` artifact; derives and prints the host functions it imports, before aggrega plugin sync records them in a Plugin entity. Takes no identifier argument. |
| `--raw` | `false` | Render the entity as authored, without resolution. |
| `--release` | — | Look a catalog name up in the terms of this Release file: through the catalog directories the workspace configuration gives that Release, with --catalog prepended. Applies to a name; a file or a registry reference is inspected as it stands and refuses it. A relative path resolves against the directory you run the command in, not against the workspace root. Where that directory is in no workspace and no root is named, an absolute path finds the workspace from the Release's own folder |
| `--resolved` | `false` | Render the entity fully resolved. |
| `--show-implements` | `false` | For a Recipe or FeatureRecipe, resolve spec.implements against the catalog and render the bound Component or Feature. |
| `--unredacted` | `false` | Print the values an author declared sensitive instead of withholding them. Anything the output reaches — a terminal, a pipe, a file, a screen recording — then carries those values in the clear. |
<!-- END GENERATED: cli-inspect -->
