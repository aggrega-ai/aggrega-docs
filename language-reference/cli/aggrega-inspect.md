# aggrega inspect

`aggrega inspect` renders a human-readable view of a catalog Component, an authored Component file, or a fully-resolved Release. It is the canonical debug surface for understanding what the compiler will produce — which Components extend which bases, which Features attach to each node, and exactly where each Feature's contributions came from.

## Synopsis

```text
aggrega inspect <identifier> [--catalog <dir>]...
```

A single positional argument routes by content shape; no subcommand is needed. The compiler dispatches per the following heuristic:

| Identifier shape | Dispatch | Output |
| --- | --- | --- |
| Starts with `./` or `../`, or ends with `.yaml` / `.yml` | **File branch** | Per-file inspection based on the file's `kind:` header (Component file or Release file). |
| Starts with `oci://` | **OCI branch** | Reserved for catalog distribution; currently not implemented. |
| Anything else | **Catalog branch** | Look up the named Component in the catalog directory; resolve `extends:` chains; render the merged schema. |

The single positional argument design keeps the command terse for the common cases (`aggrega inspect CoreAPI`, `aggrega inspect ./prod.yaml`); flags are reserved for cross-cutting overrides.

## Flags

| Flag | Default | Effect |
| --- | --- | --- |
| `--catalog <dir>` | `.` | Catalog directory to load. **Repeatable**, and **prepended** to the workspace's `catalog_dirs` (an ordered first-win search stack — an earlier directory wins an entity identity, a later one's copy is shadowed). Honors `catalog_dirs` from `.aggrega-config.yaml` even with no flag; defaults to the current directory when neither is set. The catalog branch resolves the named Component against this stack; the file and release branches still load referenced catalog entities from it when needed (e.g., resolving the parent in an `extends:` chain). |

The flag is the only override; the dispatch heuristic above is otherwise fixed.

## Three inspection modes

### Catalog Component name

```text
aggrega inspect CoreAPI --catalog ./catalog
```

Loads the catalog, finds the Component named `CoreAPI`, resolves any `extends:` chain bottom-up, merges the parent specs into the child to produce a single resolved Component, then renders:

* The Component's metadata header (name, version, labels) including the `extends:` lineage with each parent's `(name, version)` tuple.
* The resolved `schema:` block in YAML — the unified JSON Schema 2020-12 declaration covering `values:`, `infra:`, and `provides:` after compact-form expansion and `$ref:` resolution against SchemaLibrary entries.
* The Component's `usesSchema` and `secretsSchema` declarations carried through unchanged.

This is the canonical debug surface for understanding what the developer's Aggregate will see when wiring a `core/CoreAPI` instance. The output shows the contract surface the Component publishes; the resolved schema is the same one the compiler validates the developer's `values:` against.

### Component file path

```text
aggrega inspect ./components/api-server.yaml
```

Loads the YAML preamble, peeks at the `kind:` field, dispatches per-kind. For a Component file, the output shape matches the catalog branch (header + resolved schema + sockets), with one important caveat: the file branch reads a single file in isolation — **the `extends:` chain is not resolved** when the parent lives in the catalog but the user runs inspect against a local file. The output shows the authored content as-is. To see the inheritance-merged view, place the file in a catalog directory and use the catalog-name branch.

### Release file path

```text
aggrega inspect ./prod-release.yaml --catalog ./catalog
```

The highest-stakes inspection mode. Loads the Release, resolves the referenced Aggregate and Manifest, runs the entire pipeline (Resolve → ExpandAnnotations → RunGuards → Topology → IR), then renders per-node what the IR carries: every Component node, every Feature attached to that node, and **per-attachment provenance brackets** revealing exactly where each Feature contribution came from.

Output shape (abbreviated):

```text
Release: prod-release v1.0.0
Aggregate: my-app
Manifest: prod-manifest

Component: api-server
  Features:
    - core/audit-logging    [explicit]
    - core/rate-limiter     [annotation: business.aggrega.ai/team from aggregate]
    - core/data-masking
        values.fields_to_mask: ["ssn", "email"]   [explicit]
        infra.classifier_endpoint: "..."          [annotation: compliance.aggrega.ai/data-class from release; overridden by explicit at this leaf]

Component: db
  Features:
    - core/backup-policy    [annotation: state.aggrega.ai/backup-tier from release]
```

The bracketed strings are the **IR provenance brackets** — the load-bearing reason `aggrega inspect` exists. Debugging "why did this Feature attach to this Component?" or "which annotation wired this leaf?" is answerable only by reading the provenance; the bracket grammar is what the compiler emits to make the answer legible.

## IR provenance bracket grammar

Each Feature attachment in the Release view carries a provenance bracket. The bracket can take a compact form (one bracket per Feature when the attachment's provenance is uniform across all leaves) or a per-leaf form (one bracket per leaf when the attachment's leaves come from heterogeneous sources). Three bracket bodies exist; they apply identically to both forms.

### The three bracket bodies

* **`[explicit]`** — the Feature attachment is **author-declared**. The Aggregate or Release explicitly named the Feature on the affected node (`features: { audit-logging: { type: core/audit-logging } }` in the Aggregate, or the equivalent Release-side declaration). Explicit attachments are the highest-priority source; they always win over annotation-driven contributions at the same leaf.

* **`[annotation: <key> from <source>]`** — the Feature attachment is **annotation-driven**. The compiler synthesised it because an annotation on `<source>` matched a Manifest binding declaring this Feature. `<key>` is the annotation key that fired the binding (e.g., `business.aggrega.ai/team`); `<source>` is the entity that carried the annotation (`aggregate`, `release`, `component`, or `manifest`). The synthesised attachment is structurally identical to an explicit one — downstream rendering treats both the same way — but the provenance bracket distinguishes them so debugging stays decidable.

* **`[explicit; overrides annotation: <key> from <source>]`** — a per-leaf form that fires when an **explicit author declaration** at one leaf is suppressing an **annotation contribution** that would otherwise have set the same leaf. Cross-side composition produces this case: an Aggregate annotation might supply a Feature's `values:` pillar, a Release annotation supplies its `infra:` pillar, and an explicit Release declaration on the same Feature overrides one infra leaf. The leaf bracket records both the explicit author and the annotation that was suppressed; the suppressed annotation does not contribute to the rendered output but its presence appears in the inspect view so the operator can see which annotation was overridden and where.

### Compact form vs per-leaf form

The compiler chooses between compact and per-leaf rendering by walking the attachment's per-leaf provenance and checking uniformity. An attachment's provenance is **uniform** when every populated leaf (across the Feature's `values:` and `infra:` pillars) shares the same origin (explicit vs annotation), the same annotation key when annotation-driven, the same source entity, and no leaf carries an "overrides annotation" marker. When provenance is uniform, the compiler emits one bracket per attachment:

```text
- core/rate-limiter     [annotation: business.aggrega.ai/team from aggregate]
```

When provenance **diverges** — a typical case is cross-side composition, where an Aggregate annotation supplies `values:` and a Release annotation supplies `infra:` on the same Feature — the compiler emits one bracket per populated leaf:

```text
- core/data-masking
    values.fields_to_mask: ["ssn", "email"]     [explicit]
    values.classifier_endpoint: "tls13"          [annotation: compliance.aggrega.ai/data-class from aggregate]
    infra.audit_destination: "..."               [annotation: compliance.aggrega.ai/audit-bucket from release]
```

The walk order is values pillar first (in author order), then infra pillar (same discipline). The pillar prefix (`values.` / `infra.`) and the dotted path inside the pillar pinpoint exactly which leaf each bracket annotates.

## Worked examples

### Example 1 — Catalog Component lookup

```text
$ aggrega inspect ContentLibrary --catalog ./catalog

Component: ContentLibrary
  Version: 2.1.0
  Extends:
    > core/datastore/postgres (1.0.0)
  Labels:
    component.aggrega.ai/type: server
    datastore.aggrega.ai/engine: relational

Schema (resolved):
  values:
    library_name:    { type: string, required: true }
    article_format:  { type: string, enum: [markdown, html], default: markdown }
    archive_window:  { type: integer, min: 1, default: 90 }
  infra:
    compute:         { cpu, memory, ... }
    storage:         { size, type, ... }
    overrides:       { type: object, additionalProperties: true }
  provides:
    host:            { type: string }
    port:            { type: integer }
    database:        { type: string }

usesSchema:
  primary_datastore: { selector: { datastore.aggrega.ai/engine: relational }, required: true, inject: [env] }

secretsSchema:
  root_password: { required: true, inject: [] }
```

The output shows the `extends:` lineage explicitly, the resolved schema after the `extends:` merge, and the declarative tables.

### Example 2 — Release with uniform provenance

```text
$ aggrega inspect ./prod-release.yaml --catalog ./catalog

Release: prod-release v1.0.0
Aggregate: my-app
Manifest: prod-manifest

Boundary: prod (directory: deploy/prod)
  Component: api-server
    Features:
      - core/audit-logging         [explicit]
      - core/rate-limiter          [explicit]
      - core/team-cost-attribution [annotation: business.aggrega.ai/team from aggregate]

  Component: db
    Features:
      - core/backup-policy         [annotation: state.aggrega.ai/backup-tier from release]
```

Each Feature on each Component carries one bracket because each Feature's leaves come from a single source. The reader can see at a glance which Features the author declared explicitly (the `[explicit]` bracket), which were synthesised by Aggregate-side annotations cascading down (`business.aggrega.ai/team from aggregate`), and which were synthesised by Release-side annotations (`state.aggrega.ai/backup-tier from release`).

### Example 3 — Release with cross-side composition

```text
$ aggrega inspect ./prod-release.yaml --catalog ./catalog

Release: prod-release v1.0.0

Component: payment-processor
  Features:
    - core/data-masking
        values.fields_to_mask:      ["ssn", "card_number"]
                                                  [annotation: compliance.aggrega.ai/data-class from aggregate]
        values.classifier_endpoint: "redact-v2"   [explicit; overrides annotation: compliance.aggrega.ai/data-class from aggregate]
        infra.audit_bucket:         "s3://..."    [annotation: compliance.aggrega.ai/audit-bucket from release]
        infra.kms_key_id:           "alias/prod"  [annotation: compliance.aggrega.ai/audit-bucket from release]
```

The `core/data-masking` Feature's leaves come from three sources: two `values.*` leaves were synthesised by the Aggregate-side `compliance.aggrega.ai/data-class` annotation; one of those (`classifier_endpoint`) was overridden by an explicit Release-side declaration (the bracket records both the override and the suppressed annotation); two `infra.*` leaves were synthesised by the Release-side `compliance.aggrega.ai/audit-bucket` annotation. Reading this output, an operator can trace every contribution to its source and decide whether to add an explicit override at the appropriate authoring surface or adjust the annotation cascade.

## When to reach for inspect

* **Debugging "why is this Feature here?"** — annotation-driven attachments are invisible in the Aggregate and Release YAML files (the annotations are there, but the Feature attachments they synthesise live only in the IR). Inspect surfaces them with provenance.
* **Verifying schema inheritance** — `aggrega inspect <ComponentName>` shows the merged schema after the `extends:` chain resolves; the authored file alone shows only the local delta.
* **Diagnosing cross-side composition surprises** — when an Aggregate annotation and a Release annotation both supply pillar payloads on the same Feature, the resolved leaves can be confusing to reconstruct mentally. The per-leaf bracket form makes the resolution explicit.
* **Pre-deployment verification check** — `aggrega inspect ./prod-release.yaml` lists every Feature on every Component before `aggrega build` produces artifacts; the operator can confirm the topology matches intent before committing the rendered manifests to GitOps.

For the underlying mechanics — how annotations cascade, how the side-vs-pillar partition routes annotation values into Feature pillars, and how the explicit-attachment-wins discipline interacts with annotation-driven contributions — see [providers/well-known-annotations.md](../providers/well-known-annotations.md) and [entities/manifest.md](../entities/manifest.md) "Annotation-Driven Feature Bindings".
