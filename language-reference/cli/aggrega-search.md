# aggrega search

Search the local index of configured registries

<!-- BEGIN GENERATED: cli-search -->
**Synopsis**

```
aggrega search [query] [flags]
```

**Description**

```
Search the local index of the configured registries for entities matching a
free-text query and optional facet filters.

The index is the offline snapshot written by 'aggrega registry update'; search
reads it and contacts no network. Run 'aggrega registry update' first, and again
whenever you want to pick up newly published entities. A freshness line naming
each searched registry and when its index was last updated is written to standard
error, so standard output carries only the result data.

The optional positional query is a case-insensitive substring matched against
each entity's name and description. The facet filters narrow the result further,
combining as AND across facets and OR within a repeatable facet:

  --kind          entity kind (component, feature, recipe, featurerecipe,
                  workload, plugin); repeatable, case-insensitive
  --capability    a plugin capability; repeatable
  --plugin-type   a plugin socket type (for example provider, governance)
  -l, --selector  a label selector over the entity's catalog labels

Category is matched through the label selector, not a dedicated flag: a catalog
category is the label component.aggrega.ai/category, so
'-l component.aggrega.ai/category=compute' scopes the result to that category.

With no --registry, every configured registry's index is searched and the
results are merged. With --registry (a host or a friendly alias), only that
registry's index is searched.

The version reported for an entity is the one a resolution would take: a
version a publisher has retracted, where the retraction carries a signature
this workspace's trust policy verifies, is not reported. Such an entity is
still listed, and the versions left out are named in a NOTES column, so an
entity whose every published version is retracted is reported as existing with
no version to take rather than disappearing from the result. Pass
--include-retracted to report the highest published version whatever its
retraction status; the NOTES column names the retracted versions either way.
The same holds for 'aggrega search -o json', where the 'version' field carries
the version a resolution would take and a 'retracted' array names the versions
left out.
```

**Flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--capability` | `[]` | Plugin capability to match. Repeatable; a record declaring any one is kept. |
| `--include-retracted` | `false` | Report the highest published version even where a verified marker retracts it. By default the reported version is one a resolution would take. |
| `--kind` | `[]` | Entity kind to match (component\|feature\|recipe\|featurerecipe\|workload\|plugin). Repeatable; a record matching any one is kept. Case-insensitive. |
| `--limit` | `0` | Cap the number of results (0 means no cap). |
| `--output`, `-o` | `table` | Output format: table\|json\|names. |
| `--plugin-type` | — | Plugin socket type to match (for example provider, governance, linter). |
| `--registry` | — | Search only this registry, addressed by host or friendly alias. Default searches every configured registry. |
| `--selector`, `-l` | — | Label selector over the entity's catalog labels. Category is a label: -l component.aggrega.ai/category=compute. |
<!-- END GENERATED: cli-search -->

## The version a search reports

The `VERSION` column carries the version a resolution would take. A version its publisher has
retracted is not reported, provided the retraction carries a signature this workspace's trust
policy verifies — the same two conditions that decide whether a retraction affects a pull, so
a search and a pull agree on which version is the answer.

A retraction failing either condition changes nothing about what is reported. A marker at an
advisory severity leaves its version selectable, and a marker whose signature does not verify
is not a claim this workspace acts on. In both cases the highest published version is
reported exactly as it would be with no marker at all.

An entity with a retracted version is still listed. A `NOTES` column names the versions left
out, and appears only in a result that has something to report. An entity whose every
published version is retracted is reported with `(none)` as its version and a note saying no
version remains, rather than being dropped from the result — an omitted entity would be
indistinguishable from one that does not exist.

Pass `--include-retracted` to report the highest published version whatever its retraction
status, which is the answer to "what is published?" rather than "what should I use?". It
changes only the reported version; the `NOTES` column names the retracted versions either
way.

What a search reads is the local index that `aggrega registry update` writes, so it reports
what each registry stated when that index was last built. A version retracted since then is
not yet recorded, and the freshness line written to standard error names the moment each
index was built.

### The machine-readable result

`--output json` carries the same contract in two fields:

- `version` is the version a resolution would take. It is the empty string when every
  published version is retracted, which pairs with a `retracted` list naming them all.
- `retracted` lists the versions left out of that choice, in ascending version order. It is
  absent when nothing was left out.

A consumer asking which version it would get reads `version`. Deriving that from the
`deprecations` array instead means reimplementing the severity and signature conditions, and
a second implementation of those conditions is free to disagree with the one the compiler
applies; `retracted` reports the outcome those conditions already produced.
