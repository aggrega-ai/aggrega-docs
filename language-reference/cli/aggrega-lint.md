# aggrega lint

`aggrega lint` checks **publishing conventions** — naming, category-directory alignment, annotation prefixes, schema-authoring discipline, and version-bump size. It has three modes, selected by its argument, that apply the same conventions discipline at three scopes: the **whole catalog** (no argument), a single **Release's dependency closure** (`--release`), and **one entity** file (an entity path, with an optional `--pre-publish` publish gate). Each scope answers the same question — "does this content follow the catalog's publishing discipline?" — over a different slice of the catalog.

Conventions are distinct from correctness. `aggrega lint` never checks whether content is well-formed or would compile — that is [`aggrega validate`](./aggrega-validate.md), which mirrors the same three scopes for schema, pillars, reference resolution, `extends`, input-kind capability, and render. The two commands are complementary: validate tells you whether content is correct; lint tells you whether it is publishable by the catalog's conventions.

`aggrega lint` is opt-in. The compiler itself stays unopinionated about catalog discipline; these rules live in a separate plugin you choose to run. A workspace that never runs `aggrega lint` still builds and publishes.

The entity path may be given positionally or with `--entity <path>`. `--release` is mutually exclusive with an entity argument — they select different scopes; passing both halts.

## Whole-catalog conventions (no argument)

`aggrega lint` with no argument runs the structural publishing-discipline rules over every catalog entity found under the configured catalog directories. Findings are advisory — reported at `warn` severity, they never halt on a convention finding alone. Use it to sweep a catalog for naming, category-directory, and annotation-prefix drift.

Which directories it reads depends on the shape of the workspace:

- **A workspace whose configuration gives no Release catalog directories of its own** is checked once, over its search stack: the `--catalog` directories, then `workspace.catalog_dirs`, then the `catalog` directory at the workspace root when there is one.
- **A workspace that names Releases under `workspace.releases`** may keep a catalog in several variants side by side, each read by its own Release, and a single pass over all of them would read every variant at once — one variant's entity shadowing another's. So it is checked once for each Release the workspace holds, over the directories that Release reads, with the `--catalog` directories first in every pass; a Release the configuration does not name reads the workspace's list. Each pass is reported under a line naming its Release and the directories it read, with that pass's findings and its own summary after it:

  ```
  Release release-compose.yaml reads catalog-compose
  conventions checked: 7 entities, 0 advisory finding(s)

  Release release-helm-synth.yaml reads catalog-helm-synth
  conventions checked: 8 entities, 0 advisory finding(s)
  ```

  Releases that read exactly the same directories share one pass, which names each of them, so a finding there is reported once. A Release that reads no directory — its entry writes `catalog_dirs: []` — is reported as having nothing to check, and the other passes run as usual. With `-o json`, the document also carries `passes`: each pass's `releases`, `catalogDirs`, `findings` and `summary`, while the top-level `findings` and `summary` cover every pass together. The Releases a workspace holds are its Release documents — YAML files whose `kind` is `Release`, anywhere under the workspace root outside hidden directories and `node_modules`, `vendor` and `dist`.

A run with nothing to read in any pass is refused rather than reported as a clean catalog: put the entities under `catalog/`, pass `--catalog`, or set `workspace.catalog_dirs` — or, in a workspace that names Releases, a Release's own `catalog_dirs` under `workspace.releases`. It never enumerates the current working directory implicitly.

A link beneath a catalog directory that leads out of the workspace — or out of a directory you named outside it — is not read, and the run stops there, naming the link, rather than reporting a clean catalog one of whose documents it could not read; a build over the same directories stops on the same link. [The workspace boundary](workspace-boundary.md#halted) sets out the rule and its remedies.

## Conventions across a Release (`--release`)

`aggrega lint --release <release-path>` runs the same structural rules over the catalog entity files a single Release's resolved closure reaches, rather than the whole catalog or one entity. It computes the closure through the same machinery a build uses, then lints each entity's author-owned catalog file. A registry-pinned entity living in a cache slot carries no local file to lint and is skipped — the publishing rules apply to locally-authored files. As with the whole-catalog mode, findings are advisory and never halt on a convention finding alone.

This is also the one scope with a whole Release in hand, so it is where the rules that read one run — the connection-credential rule described under [The discipline rules](#the-discipline-rules). Such a rule runs once per check, after the per-entity rules, over three documents: the Aggregate the Release deploys, as its author wrote it; the Release, with its `extends` chain folded in, so a child Release carries what it inherits; and, for each component the Aggregate declares, the Component that component is an instance of, as the catalog resolves it. **No parameter value is among them.** The Release's `parameters` block, the Aggregate's own parameter declarations with their defaults, and the values the Aggregate passes to each module it imports are removed before the documents are handed to the plugin, because a parameter's value can be a credential itself; a template that reads a parameter keeps its text, so a rule still sees which parameter a value reads. Its findings are reported under the Release file.

This is the conventions counterpart to [`aggrega validate --release`](./aggrega-validate.md), which checks the same closure for correctness.

## Entity discipline: local and publish gate

The entity-path mode runs at one of two severities:

- **Default (local).** Runs the discipline rules over the local entity content at **`warn`** severity. No registry access; the version-bump check is skipped. Use it while authoring.
- **`--pre-publish` (publish gate).** Fetches the entity's latest published non-pre-release version from the registry, runs the same rules at **`halt`** severity, and additionally classifies the change as `PATCH` / `MINOR` / `MAJOR` and halts if the proposed `metadata.version` bump is smaller than the change requires. Use it in the publish flow, before `aggrega push`. `--pre-publish` applies to the single-entity shape only.

Over-bumping is always allowed; under-bumping halts. The first publication of an entity (no prior version in the registry) skips the bump check and surfaces a warning noting that no verification was performed.

## The version-bump rubric

In `--pre-publish` mode the change is compared against the previous published version and classified:

- **`PATCH`** — documentation- or comment-only changes.
- **`MINOR`** — strictly additive changes (a new optional field, a new entry).
- **`MAJOR`** — removals, type narrowing, or a previously-optional field becoming required.

The comparison is per entity kind: Component, Feature, and SchemaLibrary are compared with awareness of their schema-bearing fields; MappingLibrary is compared at the entry-key level (entry bodies are opaque, so a changed body is treated conservatively as `MAJOR`); Recipe and FeatureRecipe are compared on their load-bearing fields. Under-bumping halts with a diagnostic naming the required bump.

## The discipline rules

Most rules have a per-workspace setting under `lint.publishing_discipline` in `.aggrega-config.yaml` and a matching CLI override, each override carrying a `--no-` counterpart. Precedence is `--no-<flag>` over `--<flag>` over the workspace-config value, at every scope: the whole catalog, a Release and one entity. Every rule is on by default, and each default is grounded either in platform machinery or in a documented catalog convention; the settings are opt-outs for a workspace that has a reason to relax one.

The rules that carry no setting say so in their entry below, and the reason is the same in each case: they report a fact about the entity and leave the decision with the author, so there is no judgement to relax. The version-bump rubric described above carries none either — it compares the proposed content against the published version and reports what the change requires, which is a property of the change rather than a workspace preference.

- **Annotation prefix** — reserved namespaces (`aggrega.ai/`, and `feature.aggrega.ai/` outside a Feature) are platform-owned and rejected on other keys. Default on; opt out with `allow_aggrega_ai_prefix`.
- **Name shape** — each entity kind has a name-shape convention (segment counts for the cloud-native kinds; PascalCase for library kinds). Default on; opt out with `allow_nonstandard_names`.
- **Dynamic refs** — SchemaLibrary entries may not use `$dynamicAnchor` / `$dynamicRef` (the platform's compile-time `$ref` expansion cannot resolve them). Default on; opt out with `allow_dynamic_refs`.
- **Id overrides** — SchemaLibrary entries may not declare their own `$id` (the platform derives the canonical `$id`). Default on; opt out with `allow_id_overrides`.
- **Category matches directory** — a Component's `component.aggrega.ai/category` label must match the first directory segment under `core/`, drawn from the closed category set (`ai-agent`, `ai-model`, `ai-tool`, `ai-pipeline`, `datastore`, `gateway`, `mesh`, `network`, `messaging`, `storage`, `compute`, `observability`, `security`, `bigdata`, `devtool`). Default on for entities under a `core/` path; opt out with `allow_category_mismatches`.
- **Direct `x-aggrega-*` extensions** — directly authoring `x-aggrega-*` keys in a Component or Feature schema is discouraged in favor of the first-class authoring path. Default on; opt out with `allow_direct_x_aggrega_extensions`.
- **Provides declared by Component** — a Recipe's `spec.provides` publishes one key per entry, and the Component the Recipe implements declares, in the `provides` pillar of its `spec.schema`, which keys the type exposes. It is that declaration an `inject` `from:` reference is checked against, so a key a Recipe publishes without the Component declaring it is produced and then refused where a consumer wires it. Publishing beyond the declared contract is accepted at build time, which is why the finding is advisory rather than a rejection. Default on for Recipes; opt out with `allow_undeclared_recipe_provides`.
- **Plugin default limits** — a Plugin's `spec.runtime` carries `maxMemoryPages` and `timeoutMs`, the two caps the host applies when it loads and runs the plugin. A Plugin that pins neither runs under the platform defaults, which is a safe outcome and not an error, so the rule reports that the defaults are in effect and that explicit caps are available to pin. Default on for Plugin entities; it carries no setting.
- **Secret slot declares sensitive** — an attachment slot may pin, through its label selector, the kind of Feature that fills it to `secret`, and may separately declare `sensitive: true` to record that whatever fills it handles secret material. The selector states which fills are admissible; the marker states the handling. A slot that pins the kind and declares no marker leaves that handling to be re-derived from the selector rather than read directly. The rule reads every slot an entity declares: those of its own attachment block under `spec.featuresSchema`, and, on a Component, those each dependency socket declares under `spec.usesSchema.<socket>.featuresSchema` for the connections wired through it — a finding about a socket's slot names the socket as well as the slot. Default on for Components and Features; it carries no setting.
- **Connection credential matches target key** (`connection-credential-matches-target-key`) — a server that checks a key holds the key it verifies in a slot of its own Component, and a caller presents a key on the connection it reaches the server through. Neither end sees the other's attachments, so the two hold one key only because their authors write it at both ends — usually by having both attachments read one parameter — and a build never compares them. This rule does, and it is the one rule that reads a whole Release, so it runs under `--release` and at no other scope. It finds both ends by the names the standard catalog gives them: the target's key is the slot `api_key` its Component declares in `spec.featuresSchema`, and the caller's is the slot `credential` on the connection, written at `uses.<socket>.<alias>.features.credential` in the Aggregate or on a connection the Release wires. For each connection whose target declares `api_key` and is not labelled managed, it reports a connection carrying a credential to a target whose key slot is unfilled, a filled key slot with no credential on the connection, and two ends naming their secret differently. What it compares is each end's locator — the `origin` an attachment writes, in `values` in the Aggregate or `infra` in the Release — as the author wrote it, so two ends reading one parameter compare equal and two literals compare by their text; nothing is resolved, and a finding names the component, the connection, the target and the two slots but **never quotes either locator**, since the text written there can be the secret itself. A target declaring no `api_key` slot draws nothing, and a slot that is not the caller key, such as a model server's registry pull token, is never read. Nor is a target whose Component is labelled `component.aggrega.ai/hosting: managed` judged, whatever its `api_key` slot holds: such a Component stands for a service its vendor runs, so nothing the Release runs checks a key on it, and where it declares `api_key` — the key to a hosted model API, say, under the name the vendor's product gives it — the slot holds the key the Release presents to that vendor, never one its callers present. A target labelled `self-hosted`, `external` or `mixed`, or carrying no hosting label, is judged. It reads the attachments written on the target and on the connection: an `api_key` attachment reaching the target from a subsystem or a boundary instead leaves that connection unjudged, one an annotation adds is not among them, so a key slot filled only that way reads as unfilled, an end whose attachment writes no locator is compared only for whether it is filled, and a component an imported module contributes is not read. Because the slot names and the hosting label are catalog conventions no schema keyword marks, a catalog naming the slots differently draws nothing, and a Component that holds a vendor's key in a slot named `api_key` without the managed label is read as a target checking that key, since the slot's name and the label are all the rule reads of a target's Component. Default on; opt out with `allow_connection_credential_mismatches`.

**Artifact immutability is not one of these rules, and it has no setting.** A published `name:version` is final: `aggrega push` compares the digest already published at that tag with the digest the content about to be pushed would produce, and refuses to overwrite it with different content. Re-pushing byte-identical content uploads nothing and attaches only what that publication still lacks — its publication date, and its signature where the push signs. No flag and no workspace-config setting relaxes this, because the registry exposes no overwrite path for an operator to opt into. Changed content is published under a new version; `--pre-publish` is what verifies that bump against the previous release.

The per-rule override flags are per-invocation gates and intentionally have **no** environment variable — they are already config-backed in `.aggrega-config.yaml` under `lint.publishing_discipline`. The general `AGGREGA_*` precedence model is described in [environment-variables.md](environment-variables.md).

## Build-time and publish-time

The `x-aggrega-*` discouragement rule also runs during `aggrega build`, where it surfaces as a **warning**; `aggrega lint --pre-publish` raises the same finding to an **error**. Local builds carry the advisory; the publish gate enforces it.

## While you are authoring, in your editor

Your editor asks two different questions about a catalog entity, and they are the two this page opens with. Is the deployment **correct** — does it parse, do the pillars resolve, does it render? That is [`aggrega validate`](./aggrega-validate.md), and an editor session always answers it. Is the entity **publishable** — does the name follow the convention, does the file sit in the directory its category expects, are the annotation prefixes right? That is these rules, and an editor session answers it only when you ask.

**It is off unless you turn it on.** Turn it on with `serve.lint_on_validate` in the `.aggrega-config.yaml` of the workspace whose entities you want the advice about:

```yaml
serve:
  lint_on_validate: true
```

There is no command-line flag for it, and that is deliberate: the question is about a particular workspace's own content, and you are the one authoring that workspace rather than the one launching the language server — your editor does that.

With it on, every entity you validate also carries these findings, each naming the rule that produced it, alongside the correctness ones. Three things follow, and they are what make it usable while typing:

- **The findings stay advisory.** An entity that breaks a convention still validates, and its Release still resolves and renders. Turning the setting on adds a layer of advice; it never makes your editor refuse to work.
- **You can tell the two apart.** Every published problem names the layer that raised it, so a naming problem and a resolution failure on the same file read as two different things rather than as one problem reported twice.
- **What you have typed is what gets checked.** The rules read the buffer rather than the file on disk, so a name you correct stops being reported before you save.

Only the local-content mode runs on that layer: no registry is consulted, nothing is fetched, nothing is written. **The `--pre-publish` comparison is reached by asking for it** — your editor sends a request for it, the same way you type `--pre-publish` in the terminal — and never by editing the setting above. A check that runs every time you touch a document is precisely where a registry must not be reached, so that mode stays something you invoke rather than something that rides along.

Asking for the check outright works whatever the setting says, at all three of the scopes above. So a workspace that has never turned the per-edit layer on can still ask its editor to sweep the catalog, a Release's closure, or one entity — and get the same findings this command prints. The setting decides only whether the check also runs where you did not ask for it by name.

The protocol details sit across two pages: what the request means and when to send it are in [the `aggrega serve` reference](./aggrega-serve.md), and its parameters and the shape of its answer, field by field, are in [the wire-shape reference](../schema/other/serve-wire.md).

## Choosing the linter

The rules ship as a standard publishing-linter Wasm plugin. Because the rules live in a plugin rather than in the compiler, an enterprise can point `aggrega lint` at a different plugin to enforce its own catalog discipline without changing the compiler.

A workspace may attach more than one linter under `plugins.linter`, and every attachment runs: in the order the attachments are written, each at its own entry function, with all of their findings reported together. That is what lets a catalog keep the standard rules and add its own alongside them instead of choosing between the two. `--plugin` is the exception — it runs exactly one artifact from a filesystem path in place of the configured attachments, which is what makes it useful while developing a rule.

## Examples

Sweep the whole catalog for convention drift:

```
aggrega lint --catalog ./catalog
```

Lint an entity locally while authoring:

```
aggrega lint core/datastore/postgres/component.yaml
```

Run the publish gate before publishing a new version:

```
aggrega lint core/datastore/postgres/component.yaml --pre-publish
```

Relax one rule for a single run:

```
aggrega lint core/datastore/postgres/component.yaml --pre-publish --allow-nonstandard-names
```

## See also

- [./aggrega-validate.md](./aggrega-validate.md) — the correctness counterpart across the same three scopes.
- [./aggrega-build.md](./aggrega-build.md) — validates as part of compilation; surfaces the `x-aggrega-*` advisory at `warn` severity.
- [./aggrega-push.md](./aggrega-push.md) — publishes an entity to the registry; `aggrega lint --pre-publish` is the gate that precedes it.
- [./aggrega-pull.md](./aggrega-pull.md) — resolves and pins dependencies.
- [./aggrega-serve.md](./aggrega-serve.md) — the language server that reports these findings in your editor, and the setting that turns the per-edit layer on.
- [../errors/warnings.md](../errors/warnings.md) — non-fatal warnings, including the local-mode lint findings.

<!-- BEGIN GENERATED: cli-lint -->
**Synopsis**

```
aggrega lint [entity-path] [flags]
```

**Description**

```
aggrega lint checks publishing CONVENTIONS — naming, category-directory
alignment, annotation prefixes, and the rest of the publishing-linter
discipline. It does not check correctness (schema, pillars, resolution,
render): that is aggrega validate.

Three invocation shapes, mirroring validate:

  aggrega lint                    conventions across every catalog entity
  aggrega lint --release <path>   conventions across a Release's dependency closure
  aggrega lint <entity>           publishing discipline for one entity

Without an entity argument, lint runs the structural conventions rules
over every catalog entity found under the catalog directories. Where the
workspace configuration gives its Releases catalog directories of their own
under workspace.releases, it runs them once for each Release, over the
directories that Release reads, and reports each pass under a line naming
its Releases and those directories; Releases reading the same directories
share one pass. With --release it runs them over the entities that
Release's closure reaches, and also runs the rules that read a whole
Release: once, over the Aggregate it deploys, the Release and the
Components the Aggregate's components are instances of, with every
parameter value removed. In both, findings are advisory (warn severity)
and never halt.

With an entity path, lint runs the publishing-linter rule set against
that one entity. In default mode the rules run at warn severity over
local content without consulting any registry. With --pre-publish the
previous registry version is fetched and the schema-evolution
classification is compared against the proposed version bump; mismatches
halt. --pre-publish applies to the single-entity shape only. Per-workspace
policy flags from .aggrega-config.yaml's lint.publishing_discipline block
can be overridden per invocation via the --allow-*/--no-allow-* flag pairs,
in all three shapes.

All three shapes accept -o json, which replaces the human report on standard
output with one structured document: every finding with its severity, the rule
that produced it, its short code (the code printed at the head of its row in
the human report, which aggrega explain expands), its message, and the entity
file it concerns, plus counts by severity. A finding from a rule Aggrega does
not declare, one a linter of your own adds, carries no short code, as its row
prints none. A finding carries a line and column only when the rule that
produced it located the issue that precisely; otherwise the file alone locates
it. The message is the rule's own text, carried through unchanged, so the
structured and human renderings never word a finding differently. The exit
status is the same under either format.
```

**Flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--allow-aggrega-ai-prefix` | `false` | Force allow_aggrega_ai_prefix=true |
| `--allow-category-mismatches` | `false` | Force allow_category_mismatches=true |
| `--allow-connection-credential-mismatches` | `false` | Force allow_connection_credential_mismatches=true |
| `--allow-direct-x-aggrega-extensions` | `false` | Force allow_direct_x_aggrega_extensions=true |
| `--allow-dynamic-refs` | `false` | Force allow_dynamic_refs=true for this invocation |
| `--allow-id-overrides` | `false` | Force allow_id_overrides=true for this invocation |
| `--allow-nonstandard-names` | `false` | Force allow_nonstandard_names=true |
| `--allow-undeclared-recipe-provides` | `false` | Force allow_undeclared_recipe_provides=true |
| `--baseline` | — | Diff the pre-publish evolution check against this specific already-published version instead of the auto-selected highest version below the one being published; must be a strict-SemVer tag present in the registry (requires --pre-publish) |
| `--catalog` | `[]` | Catalog directory; repeatable. Each --catalog is prepended to the catalog search stack (first match wins): the workspace catalog_dirs, or, for a Release the workspace configuration gives directories of its own under workspace.releases, that Release's; the stack ends with the `catalog` directory at the workspace root when there is one. A catalog_dirs list written empty reads no local catalog at all. Used by the whole-catalog and --release conventions passes. |
| `--entity` | — | Path to the entity YAML to lint (alternatively pass as the positional arg) |
| `--no-allow-aggrega-ai-prefix` | `false` | Force allow_aggrega_ai_prefix=false |
| `--no-allow-category-mismatches` | `false` | Force allow_category_mismatches=false |
| `--no-allow-connection-credential-mismatches` | `false` | Force allow_connection_credential_mismatches=false |
| `--no-allow-direct-x-aggrega-extensions` | `false` | Force allow_direct_x_aggrega_extensions=false |
| `--no-allow-dynamic-refs` | `false` | Force allow_dynamic_refs=false for this invocation |
| `--no-allow-id-overrides` | `false` | Force allow_id_overrides=false for this invocation |
| `--no-allow-nonstandard-names` | `false` | Force allow_nonstandard_names=false |
| `--no-allow-undeclared-recipe-provides` | `false` | Force allow_undeclared_recipe_provides=false |
| `--output`, `-o` | `text` | Output format: text\|json. |
| `--plugin` | — | Filesystem path to the publishing-linter .wasm artifact (runs this artifact instead of the workspace plugins.linter attachments) |
| `--pre-publish` | `false` | Fetch the previous registry version and verify the proposed bump against the schema-evolution classification |
| `--release` | — | Path to a Release YAML to check conventions over its resolved dependency closure (mutually exclusive with an entity argument) |
<!-- END GENERATED: cli-lint -->
