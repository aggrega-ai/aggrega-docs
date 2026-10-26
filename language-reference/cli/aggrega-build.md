# aggrega build

`aggrega build` compiles an Aggregate + Release pair into provider-native artifacts (Helm manifests, redistributable Helm charts, docker-compose YAML) under `dist/` at the workspace root, as [Output](#output) sets out. The Release is the single entry point: it names the Aggregate and Manifest, declares boundaries, and routes components to providers.

## Common flags

Two flags carry behaviour the flag reference below cannot convey on its own:

- `--catalog <dir>` — a directory containing catalog entities — the Component, Feature, Recipe and FeatureRecipe authoring kinds together with the library kinds, Aggregates and Plugins — loaded **recursively**. Each `--catalog` directory is searched before the configured ones, in the order given. To search a project-local catalog alongside a shared one, pass both (`--catalog ./catalog --catalog ../shared-catalog`) or list them under `catalog_dirs`. With `--detail`, any entity a higher-precedence directory shadows is reported on stderr, with the other build warnings. A `--catalog` directory that does not exist stops the build, naming it. A directory listed under `catalog_dirs` where nothing exists does not: it is read as holding nothing, as the pull that filled the lockfile read it, and the build prints a line naming it — see [Where local entities are read from](configuration.md#where-local-entities-are-read-from).
- `--detail` — reports what the pull step did, the same transient pull-event diagnostic that [`aggrega pull --detail`](aggrega-pull.md) emits. What decides whether there is anything to report is whether a pull step was **asked for** — with `--auto-pull`, or by enabling `auto_pull` — and not whether a lockfile is already present: a requested pull step runs either way, filling a missing lockfile and honouring the pins in an existing one. When no pull step runs, the flag prints a one-line note to stdout and proceeds — it never fabricates a resolution tier the committed lockfile does not carry. For the post-pull resolution *state* of a Release's dependencies, use [`aggrega inspect`](aggrega-inspect.md).

`--dry-run` is covered in [Previewing a build without writing it](#previewing-a-build-without-writing-it), and `--trace` and `--trace-unredacted` in [Trace output](#trace-output) and [Showing the withheld values](#showing-the-withheld-values) below.

## Filling the lockfile as part of the build

Build is read-only about dependencies by default: it needs a lockfile and writes none. `--auto-pull`, and the `auto_pull` workspace setting, add the pull step to the build, so one command resolves the Release's dependencies and compiles against what it resolved.

**An edit to the Release is something the lockfile notices.** The lockfile records the Release — and each Release it extends — by the digest of its content, so a read-only build over a Release edited since the pull halts before anything renders, naming the file and telling you to run `aggrega pull --release <release>`, which records the edit while honouring every other pin. A comment or whitespace change counts, because the digest covers the bytes as they are. An auto-pulling build runs that pull step itself, so it records the edit and builds.

**The Release is rendered once.** Which external inputs a Release consumes follows from rendering it rather than from anything its documents declare, so the pull step renders the Release to find out — and that render is the build's. An auto-pulling build therefore costs one render, the same as a plain build over a lockfile that is already in place.

**The flags that shape a render apply to it.** `--trace`, `--verify-determinism`, `--disable-plugin-cache` and `--no-unsupported-field-warnings` reach the render an auto-pulling build performs on the same terms they reach a plain build's, so asking for a trace or a determinism check on a one-command build gets you one. `--dry-run` is the exception and it is a refusal rather than a silence: a dry run writes nothing while the pull step writes, so the pairing halts before any work (see [Previewing a build without writing it](#previewing-a-build-without-writing-it)).

## How a build reads what the lockfile pins

A lockfile pin names content — a digest — rather than a place. For an entity it is the digest of what a publication of it carries, its document and the files it names, so a catalog-directory copy of an entity and a cache entry holding its publication carry the same pin, as [The lockfile](aggrega-pull.md#the-lockfile) describes. A build reads each pinned dependency from the sources already on the machine: the catalog directories first, as everywhere else, then the content cache under `.aggrega/cache`. Reading them asks no registry; only the pull step, where a build runs one, fetches.

**A cache entry that no longer holds its pin is passed over.** An entity edited in place — a new body under the same `version` — leaves the content cache holding the earlier body under that name and version. Where a catalog directory holds a copy whose content digests to the pin, the build reads that copy and never reads the entry, and it says so on standard error, naming the entry and both digests:

```
  reuse: cache entry for <name>:<version> holds <digest the entry holds>, not the pinned <pinned digest>; passed over for <catalog file>, which holds the pinned bytes
```

**Where no catalog directory holds the entity, a complete cache entry holding exactly the pinned bytes is read as the dependency**, so an entity removed from its catalog directory after its published copy was fetched still builds from that copy.

**Where no source holds the pinned bytes, the build halts before anything renders**, with `E0135` — or `E0133` where the cache entry's manifest is not the one the lockfile pins. The halt names the pin, the cache entry and the digest it holds, and each catalog-directory copy of the entity with its digest, or that no catalog directory holds it. The remedy is a pull with a registry reachable, which fetches the pinned version again and holds what it fetches to the pin; see [Honoring vs. updating](aggrega-pull.md#honoring-vs-updating) for what the pull does when the registry no longer serves those bytes.

The render `aggrega pull` runs to discover external inputs, and a build or preview through `aggrega serve` or `aggrega mcp`, read their pins the same way.

## External inputs at build time

A render can request content from a remote URL — a chart's values schema with a remote reference, for example — and a build never fetches one in order to add it to what the render may read. A request for a URL the lockfile already pins is served from the workspace's input store and verified against the recorded digest before any byte reaches the render. A request for an unpinned URL halts, naming the URL and the step that pins it; there is no setting that turns that halt into a fetch, because quietly widening the set of inputs a build reads is the one thing a reproducible build must not do.

Where the store's copy of a pinned input has gone missing, that one input is refetched by the digest the lockfile already records and checked against it before anything is written or returned. That cannot change what the render sees — the digest was committed to when the input was pinned — so it repairs the store rather than adding to the closure, and the lockfile is left byte-unchanged. Under the offline posture there is no transport for even that, and the missing copy halts instead, naming the posture.

Pinning happens when the Release's dependencies are resolved, so what a build may read is settled before the build starts. [`aggrega pull`](aggrega-pull.md) is that step, and it is the only one.

## The plugin trust record

Three of a build's behaviours depend on `plugins-trust.yaml`, the committed file beside the Release's lockfile that records which plugin each verdict-returning attachment resolved to — a `plugins.governance` attachment in an `ir-verdict` or `render-verdict` role, and every `plugins.linter` attachment. [`aggrega pull`](aggrega-pull.md) writes it and the [plugin trust record schema](../schema/other/plugins-trust.md) describes its fields; what follows is only what a build itself does with it.

**A build is held to the record before any of those plugins runs.** A plugin served from the cache whose artifact digest is not the recorded one is refused rather than run — that is the resolution such an attachment normally takes, and [`aggrega pull`](aggrega-pull.md) sets out which other ways of resolving one the recorded digest does not govern. And a recorded entry that no attachment in `.aggrega-config.yaml` accounts for any more halts the build: dropping a gate changes no rendered byte, so output produced without a reviewed gate looks exactly like output that gate approved. The halt names the plugin and offers the two remedies that differ by what you meant — attach it again if the removal was a mistake, or ask for the removal explicitly if it was not — and it prints the command ready to run. An attachment the record does not yet hold is a first sighting, and neither comparison halts on it.

**A build holds each of those plugins to the signature its entry records, exactly as it holds a lockfile entry to the one that entry records.** Where an entry records a verified `signature`, the build re-hashes the signature bundle that fact names in the cache before anything renders, and stops with `E0144` where the bundle is missing or differs. For a plugin it reads from the content cache, it also reads from that bundle which artifact the signature was made for, and stops with `E0332` where it was made for a different plugin than the one the build read — which is what a `signature` copied from another entry looks like — whatever the signing requirement says. For a plugin the content cache served, either refusal names `aggrega pull --release <release>`: the next pull verifies the plugin's signature again, records the plugin's own and caches the bundle it names, rewriting a cached copy that no longer matches its digest. Where the workspace's trust configuration requires a signature for a plugin the build reads from the content cache — under the same settings that would make [`aggrega pull`](aggrega-pull.md) refuse it unsigned, so `skip_signature_verification` and an `advisory` registry let the build go ahead as they let the pull — an entry recording no signature, or no entry for the plugin at all, stops the build with `E0331`, naming the plugin, `plugins-trust.yaml` and the settings that require the signature. The remedy is `aggrega pull --release <release>`, which verifies the plugin's signature at its registry on every run and records it. A plugin served from one of your catalog directories, or from the copy inside the compiler binary, is never held to that requirement. Like the rest of the build, this reads files already on the machine and asks no registry anything.

**`aggrega build --upgrade` rewrites that file.** It implies `--auto-pull` and runs a *bare* full refresh, which re-resolves every dependency and therefore re-resolves and rewrites every recorded identity, and drops every entry no attachment accounts for. So if this file turns up modified after an upgrade build, that is why: the flag's reach is every dependency, and the recorded identities are part of what gets re-resolved even though they are not lockfile pins. Unlike `aggrega pull --upgrade`, the build flag takes no target, so it cannot be narrowed to one plugin: to adopt or drop a single identity, run [`aggrega pull --upgrade --release <release> <plugin>`](aggrega-pull.md) instead, which leaves every other pin and every other recorded identity untouched.

**Because its reach is everything, it asks before it starts.** `aggrega build --upgrade` confirms the refresh on the same terms the bare [`aggrega pull --upgrade`](aggrega-pull.md) does — the two are the same act, so they ask the same question. Pass `--yes` to answer in advance for non-interactive use; with standard input not a terminal and no `--yes`, the build refuses rather than waiting for an answer nobody can give. A build that does not refresh asks nothing.

## Workspace resolution and determinism

The Release's schema-required `manifest:` reference is resolved relative to the Release
file. A relative `catalog_dirs` entry (and a relative filesystem plugin path) resolves
against the directory of the `.aggrega-config.yaml` that declared it — "relative"
always means relative to the file you wrote it in, so a path means the same
thing wherever you invoke `aggrega` from. A `--catalog` flag, which has no
declaring file, resolves against the current working directory. Registry
references (`oci://…`, a hub reference) are left as-is.

The workspace root is the directory of the nearest ancestor `.aggrega-config.yaml`
carrying a `workspace:` block, or the directory `--workspace-root` names. When the
root is pinned this way, a build is **invocation-location-independent**: running
`aggrega build` from the project root and from a subdirectory produces
byte-identical IR and rendered artifacts, because the catalog searched and the
source paths recorded in the output do not shift with the working directory. (With
no `workspace:` marker and no `--workspace-root`, the working directory is the
root, so output is anchored there instead — unless the working directory anchors
nothing and `--release` names the Release by an absolute path: the root is then
discovered again from the Release's own folder, so the catalog searched and the
paths recorded in the output are those of the project the Release belongs to,
wherever you run the command from. See
[configuration.md](configuration.md#the-other-ways-a-project-root-is-recognised).)
Where no workspace is found that way either and nothing names one, the build says on
standard error which folder it used as the root, and a build asked to resolve its
dependencies first is refused before anything is fetched, because the cache that
resolution fills would be written in that folder and make it a workspace. A build that
resolves nothing first still renders, but for the same reason an external input the
lockfile pins and the cache no longer holds is not fetched again: the plugin that asks
for it is told the refusal's sentence in its place, as it is told the offline posture's,
and the build reports what that plugin makes of it. A
`--workspace-root` or `AGGREGA_WORKSPACE_ROOT` naming a folder that does not exist is
refused before the build does anything else, naming whichever of the two supplied it.

## Environment variables

The workspace settings build reads can be overridden through the environment, above the committed config and below any flag: `AGGREGA_OFFLINE`, `AGGREGA_AUTO_PULL`, `AGGREGA_CATALOG_DIRS` (OS-path-list separated; supply absolute paths), `AGGREGA_ARTIFACT_CACHE_DIR`, `AGGREGA_DEFAULT_REGISTRY`, and `AGGREGA_WORKSPACE_ROOT`. See [environment-variables.md](environment-variables.md) for the full list and the precedence model.

## Output

Rendered artifacts land under `dist/` beneath the workspace root, whichever folder the command is run from — the root itself, a folder beneath it, or a folder elsewhere with the root named by `--workspace-root` or `AGGREGA_WORKSPACE_ROOT` — and the closing line names that directory in full:

```
Build completed: 4 files written to <workspace>/dist
```

`<workspace>` stands here for the workspace root, which the line spells out as a full path. Where no workspace is found and nothing names one, the folder the command was run from is the root, so `dist/` is written there. A `dist` that is a link leading out of the workspace is refused before anything in it is removed or written. A Release that declares no boundaries writes per provider: `dist/<provider>/<files>`. A declared boundary with no `directory:` writes per boundary, per provider: `dist/boundaries/<boundary-path>/<provider>/<files>`. Operator-authored `directory:` and `subDirectory:` overrides on Release boundaries change the target path; per-`(path, provider)` collapse merges contributors that resolve to the same evaluated path.

### YAML indentation

Every rendered YAML artifact — docker-compose files, Helm chart templates and values, and Kubernetes manifests — is emitted at a uniform indentation width. The width is set by `build.yaml_indent` in `.aggrega-config.yaml` and defaults to **2** (the conventional width for those formats):

```yaml
build:
  yaml_indent: 2   # default; accepts 2 through 9
```

The width is applied at a single marshal point shared by every renderer, so output stays byte-identical across runs of the same input. Values outside the `[2, 9]` range are rejected by config-schema validation.

### Handing back the compiled graph

`--ir-graph` writes the graph this build resolved to standard output as JSON. It is additive: the artifacts are still written to `dist/`, the summary is still printed, and the rendered bytes are unchanged. The graph goes out ahead of everything else the build prints there — one JSON document and one trailing newline — so a consumer decoding the stream reads it and stops.

The graph handed back is the one the render consumed, so it describes exactly the build that produced the artifacts beside it rather than a second resolution of the same Release. It combines with `--dry-run`: the graph is written and the artifact report follows it, with nothing written to disk.

Values an author declared sensitive are withheld from it, in the structured form described at [`aggrega inspect`](aggrega-inspect.md#machine-readable-output). `--unredacted` beside `--ir-graph` prints them instead, on the terms `aggrega inspect --unredacted` states: it reaches the graph and nothing else — the trace files have `--trace-unredacted` of their own, and the rendered artifacts are never withheld — and whatever the output reaches then carries those values in the clear. Passed without `--ir-graph` it is refused, because there would be nothing for it to reveal.

The same flag, with the same meaning, is on [`aggrega inspect`](aggrega-inspect.md) and [`aggrega validate`](aggrega-validate.md).

## Previewing a build without writing it

`--dry-run` runs the same compile a build runs — the same dependency gates, the same render, the same providers — and prints what it would emit instead of writing it. Each artifact is reported with the path it would occupy and the content it would hold:

```
aggrega build --release releases/production.yaml --dry-run
```

```
==> <workspace>/dist/main/helm/webapp-configmap-webapp.yaml <==
apiVersion: v1
kind: ConfigMap
...

Total build time:               2.5s
Dry run: 1 files would be written to <workspace>/dist; nothing was written
```

The artifacts are reported in the order a build writes them, so the same input reports the same bytes in the same sequence, and the path reported is the path a build would write to — beneath the workspace root, spelled out in full where `<workspace>` stands above.

**What is not written.** The output directory is left exactly as it stands — it is not cleaned either, so a previous build's output survives a dry run intact. The lockfile is not written. Nothing is written to `.trace/`.

**External inputs behave exactly as they do in an ordinary build**, on the terms [External inputs at build time](#external-inputs-at-build-time) sets out. A dry run therefore reads the same pinned closure the build it stands in for would read, and what it shows is what that build would write.

Where a reference was declined, the run names every one it could not reach and points at the command that pins them:

```
  note: the lockfile does not pin every external reference this render requested, so the following were declined and the render stopped short of the artifacts it would otherwise emit:
    - https://charts.example.com/values-schema.json
  Run `aggrega pull --release releases/production.yaml` to pin the inputs the render needs, then run the dry run again
```

Run [`aggrega pull`](aggrega-pull.md) once and the dry run has everything it needs; nothing else about it changes.

**A dry run needs a lockfile and never fills one.** Build is read-only by default, and a dry run holds to that whichever way a fill was requested. `--auto-pull` and `--upgrade` are refused outright (below); the `auto_pull` workspace setting is overridden for that one invocation, so a workspace that fills by default can still be previewed. With no lockfile a dry run halts with the same remediation an ordinary read-only build gives: run [`aggrega pull`](aggrega-pull.md) first.

**The flags it refuses.** Three flags write, so pairing them with a dry run has no honest outcome — ignoring the write would make a requested fill vanish, and honouring it would break the one promise the dry run makes. Each pairing halts before any work, naming the flag you passed and the step to run instead:

| Paired with | Why it refuses |
| --- | --- |
| `--auto-pull` | fills the lockfile; run `aggrega pull` as its own step |
| `--upgrade` | re-resolves every dependency and rewrites the lockfile; run `aggrega pull --upgrade` as its own step |
| `--trace` | writes per-node files to `.trace/`; run the traced build without `--dry-run` |

Everything else composes normally. `--verify-determinism` renders each node twice and compares the bytes without writing any of them, and `--catalog`, `--quiet`, `--progress`, `--debug` and the warning filters behave exactly as they do on a build that writes.

**What it is for, and what it is not.** A dry run answers "what would this Release emit", which is a question only a render can answer — so it is not a substitute for [`aggrega validate`](aggrega-validate.md), which checks correctness without rendering, or for [`aggrega inspect`](aggrega-inspect.md), which queries the graph before the render. Reach for a dry run when the answer you want is the artifacts themselves: reviewing what a Release change does to the output, or checking a Recipe edit before committing anything to `dist/`.

## Trace output

The `--trace` flag turns on a per-node debug dump capturing every intermediate compiler state. Output lives at `.trace/` beneath the workspace root, next to `dist/` (never under it; the sibling layout follows the convention of `.git/`, `.terraform/`, `node_modules/` and keeps `dist/` purely deployable).

The directory layout is per-boundary, per-instance:

```
.trace/
└── boundaries/
    └── <boundary-path>/
        └── <instance-id>/
            ├── 01-pillars-initial.yaml
            ├── 02-provides-evaluation.yaml
            ├── 03-inject-hydration.yaml
            ├── 04-inject-mapping.yaml
            ├── 05-source-resolution.yaml
            ├── 06-source-locals.yaml
            ├── 07-values-mapping.yaml
            ├── 08-workload-synthesis.yaml
            ├── 09-artifact-evaluation/
            │   └── <per-artifact-file>.yaml
            ├── 09b-feature-rendering-boundary.yaml
            ├── 10-engine-synthesis/
            │   └── <per-synthesized-file>.yaml
            ├── 11-engine-emission.log
            └── 12-labels-injected.log
```

Each slot captures a specific compiler state:

- `01-pillars-initial.yaml` — the per-node snapshot of the context a template reads, taken after resolution and before any per-stage mutation. Carries `.values`, `.infra`, `.context`, `.parameters`, `.metadata`.
- `02-provides-evaluation.yaml` — the resolved `provides:` outputs after provides evaluation.
- `03-inject-hydration.yaml` — the merged `.context.inject` pipe after inject hydration (consumer-side view of upstream `provides`).
- `04-inject-mapping.yaml` — the `.context.inject` pipe after the FeatureRecipe `injectMapping` rewrites.
- `05-source-resolution.yaml` — the parsed `source:` content the provider will consume. Present only when the Recipe declares `source:`.
- `06-source-locals.yaml` — the resolved `locals:` block. Source resolution publishes `.locals` before it evaluates the `source:` template, which is why this slot is written whether or not the Recipe declares `source:`.
- `07-values-mapping.yaml` — the rendered `valuesMapping:` output (the dictionary the provider receives). Present only when the Recipe declares `valuesMapping:`.
- `08-workload-synthesis.yaml` — the context as it stood when the `workload:` template was evaluated and its output parsed. Present only when the Recipe declares `workload:` (inline or `$import:`-loaded). The parsed `Workload` itself is not in this slot: it appears from `09-artifact-evaluation/` onward, once it is settled rather than in flight.
- `09-artifact-evaluation/` — one file per evaluated artifact. Present only when the Recipe declares `artifacts:` (with entries inline or per-entry `$import:`-loaded).
- `09b-feature-rendering-boundary.yaml` — the context as the node's render ends, once the FeatureRecipes attached to it have generated their resources, with the parsed `workload` beside it. Written for every node.
- `10-engine-synthesis/` — one file per synthesized manifest the provider produced from the Workload (helm/compose workload-mode). Present only when the provider ran a synthesis path.
- `11-engine-emission.log` — the post-emission summary (file count, output paths) for the node.
- `12-labels-injected.log` — the provenance labels and annotations written onto rendered output for the node.

The trace writer is non-blocking: the trace is written to disk alongside the compile rather than in its path. Compile latency is unaffected by trace I/O — the same compile finishes in the same wall-clock time whether `--trace` is on or off.

### Declared-sensitive values in the trace

A datum an author declared sensitive — a schema leaf carrying `sensitive: true`, or a delivery key whose material came from a `provides` key that does — is written to the trace as the fixed text `<redacted>`. The key is kept and only the value is replaced, so a slot still shows which leaves and which delivery keys a node carries. An undeclared sibling in the same block prints its value verbatim; the substitution follows the declaration and nothing else.

A value a FeatureRecipe delivers through its own `injectMapping` is withheld as well. That is the route a slot declaring an empty `inject` list hands delivery to, and the route an inject-only credential realization takes. The delivery key such a mapping writes is itself a template, so no declaration names it; what is read instead is the mapping's own text. When that text references a `values` or `infra` leaf the attached Feature declares `sensitive: true`, every delivery key the mapping produced reads as `<redacted>` — including a key that carries nothing sensitive, since the reading is per attachment rather than per key. A mapping that references nothing declared prints its keys verbatim.

A value a template computed from a declared-sensitive datum is withheld too, even though its own key carries no declaration. What identifies it is the reference the author wrote: a `locals:` entry whose template reads a declared-sensitive leaf is withheld, and so is a `source:` field that does. The reading is conservative — a template that reaches a whole object reaches every declared leaf under it, so `{{ range $k, $v := .values.creds }}` withholds its output when anything under `creds` is declared — and a `locals:` entry that reads an already-withheld sibling is withheld in turn. A sibling entry of the same shape that reads nothing declared prints verbatim.

A value that travels across a `uses` edge is withheld against the **target's** declarations, not the consuming node's, and it is withheld on both surfaces the edge carries it to. `.context.uses.<alias>.provides` reproduces what the target component published, so what governs those values is the target's schema: a `provides` key the target declared sensitive reads as `<redacted>` on the consumer's slot even when the consumer declares nothing at all. When the edge's own `inject` block routes that key onto a delivery key of the consuming component, `.context.inject` withholds that delivery key too — the same rule an attachment's `inject` mapping already follows, reading the same declaration. The withholding is per edge, so two edges publishing the same `provides` key name resolve independently: the one whose target declared it is withheld and the other prints verbatim. The rest of the edge — its target, its socket, its labels, the `inject` mapping's own key names, and the per-connection `values` and `infra` authored on the edge itself — is not what a target's `provides` declaration governs, and prints verbatim.

The attachments written on a connection are shown under that connection's edge, at `.context.uses.<alias>.features.<slot>`, and each is withheld against its own **Feature's** declarations — the same ones that govern that Feature when a component holds it directly. A `values` or `infra` leaf the Feature declares `sensitive: true` reads as `<redacted>`, and so does a key of the attachment's resolved `provides` that the Feature declares sensitive; each key is kept. The attachment's type, version and labels, and every leaf and `provides` key its Feature leaves undeclared, print verbatim, so a published locator stays readable beside the material it locates. The withholding is per connection and slot, so the same Feature written on two connections resolves on each. A slot declaring `sensitive: true` — on the component or on its socket — says the attachment handles secret material and withholds no leaf on its own: which leaves are withheld is the Feature's to declare. A component's own attachments are not among the blocks a slot shows, since the trace carries no `.features` block; what a `workload:` template reads from one is covered by the re-render below.

The parsed `Workload` is a **re-render**, not a capture of the document the build emitted, and the slots that carry it — `09-artifact-evaluation/`, `10-engine-synthesis/` and `09b-feature-rendering-boundary.yaml` — say so in a `workload_note` entry beside it. A rendered document records nothing about which declaration a given character came from, so there is no key at which to substitute inside it. What the trace shows instead is the same `workload:` template evaluated a second time, against a context whose declared-sensitive data already reads as `<redacted>`. Because the template sees a string where a string was, the result keeps the emitted document's shape: the same fields, in the same places, with `<redacted>` standing in the withheld datum's own position and the literal text around it unchanged.

Two ways that re-render differs from what was emitted, both of which the note states:

- **A template that branches on the *content* of a value renders differently.** An `eq` against a specific value, a length test, a hash or an encoding of it: each sees `<redacted>` and produces a different result — a different branch, a different length, a different digest. This is why the trace never claims to show the emitted document.
- **Data no declaration names is carried through unchanged.** The substitution covers what the axis names — a declared `values` / `infra` leaf, a marked delivery key, a `provides` key the component's own Component declares sensitive, a consumed target's declared `provides`, a declared leaf or `provides` key of an attachment the component holds itself (read at `.features.<name>`) or of one written on a connection, and a `locals:` or `source:` value computed from one. That is the same data a refusal raised by the template is withheld by. A datum reaching the template through anything else, such as a `provides` key no declaration names whose value a Recipe computed from a declared leaf, appears in the re-render exactly as it appears in the emitted document.

When the re-render cannot be produced at all, the slot keeps the `workload:` key and replaces the document with a line saying so and naming `--trace-unredacted`. The statement is deliberate: a projection that simply vanished would be indistinguishable from a Recipe that declares no `workload:` at all.

One limit is worth reading before treating `.trace/` as safe: **`dist/` is not redacted.** Rendered artifacts are emitted exactly as the render produced them, because they are the deployable, and the trace's re-render never reaches them — the same input renders byte-identically whether `--trace` is on or off.

Treat `.trace/` as carrying material and handle it the way `dist/` is handled.

### Showing the withheld values

`--trace-unredacted`, alongside `--trace`, writes the declared-sensitive values into the trace files instead of the text that stands in for them. It exists because the withheld value is sometimes the one being debugged — a credential arriving from the wrong attachment looks identical to the right one when both read as withheld.

It is also how the document the build actually emitted is captured: with nothing withheld there is nothing to substitute, so the `workload:` slots carry the emitted document rather than a re-render of it, and the `workload_note` entry is absent.

Three properties bound it:

- **Every file it writes says what it is.** Each trace file the run produces opens with a comment naming the flag and stating that declared-sensitive values appear below in the clear, so a file later attached to a bug report or left in a shared directory carries its own warning. The comment is valid in the file's own format, so the file still parses.
- **It reaches `.trace/` and nothing else.** Rendered artifacts are byte-identical with and without it — it changes what a debug file shows, never what a build produces — and the `aggrega inspect` layouts and the diagnostic text a failed build prints are identical in both states.
- **It lives on the invocation only.** There is no configuration setting for it, so it cannot be turned on once and left on for everyone who builds the workspace afterwards. Requesting it without `--trace` halts the build with a message naming both flags, rather than accepting a request it cannot honour.

Separately from the trace, a build prints one advisory per delivery key that carries declared-sensitive material as a literal value, naming the component, the target, the attachment and the delivery key. It never halts the build and `--no-unsupported-field-warnings` does not silence it — that flag covers what a target cannot honour of the things you authored, a different class.

The keyword, its two authoring sites, the advisory's exact wording and the full ceiling on what declaring it achieves are at [`vocabulary/compact-form-authoring.md`](../vocabulary/compact-form-authoring.md) "Declaring a leaf sensitive".

## When to use `--trace`

- Diagnosing why a rendered manifest doesn't carry an expected value: walk the per-pass dumps to find the first slot where the value is missing.
- Verifying determinism after a compiler upgrade: two compiles of the same input with `--trace` produce byte-identical trace dumps; any per-slot diff localises the regression.
- Catalog authoring iteration: comparing the `04-inject-mapping.yaml` and `06-source-locals.yaml` snapshots shows what the Recipe's templates see at evaluation time.

## Examples

Compile a Release against the local catalog:

```
aggrega build --release releases/production.yaml
```

Compile with a separate catalog directory:

```
aggrega build --release releases/production.yaml --catalog ../platform-catalog/
```

See what a Release would emit without writing any of it:

```
aggrega build --release releases/production.yaml --dry-run
```

Compile with trace dumps for debugging:

```
aggrega build --release releases/production.yaml --trace
```

After the compile, inspect `.trace/boundaries/<boundary>/<instance>/` for per-pass state. The `.trace/` directory is overwritten on each `--trace` run; previous trace state is not preserved across compiles.

## Cross-references

- [`aggrega-pull`](aggrega-pull.md) — fetch catalog entities from an OCI registry into the local catalog.
- [`aggrega-validate`](aggrega-validate.md) — check catalog, Release-closure, or single-entity correctness without emitting artifacts; the dependency validation a build runs, without the render.
- [`aggrega-lint`](aggrega-lint.md) — check catalog publishing conventions across the same three scopes.
- [`aggrega-inspect`](aggrega-inspect.md) — query the IR graph after graph finalization without proceeding to render.
- [Errors](../errors/error-translation.md) — the categorized error rendering format that surfaces at the CLI.

<!-- BEGIN GENERATED: cli-build -->
**Synopsis**

```
aggrega build [flags]
```

**Description**

```
Compile an Aggregate and Release pair into provider-native artifacts under each
boundary's output directory.

The Release is the single entry point: it names the Aggregate and the Manifest,
declares the boundaries, and routes each component to a provider. What a
provider emits is the provider's own shape — Helm manifests, a redistributable
Helm chart, docker-compose YAML — so the output directory holds whatever the
providers this Release routes to produce.

The output directory is dist/ beneath the workspace root, whichever folder the
command is run from, and the closing line names it in full. A run that finds no
workspace uses the folder it was run from as the root, and writes dist/ there.

Build is read-only by default and needs a lockfile. Run "aggrega pull" first to
create one, or pass --auto-pull to fill it in-process for this build.

Given identical input, build writes byte-identical output, which is what makes
the rendered tree reviewable as a diff.
```

**Flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--auto-pull` | `false` | Run the pull step before building: resolve the Release's dependencies into the lockfile and cache in-process, then build against them. This is the same in-process fill the workspace auto_pull setting performs, turned on for a single build without editing workspace config. On its own it is an incremental fill — existing pins are honored, and references with no pin are resolved and added |
| `--catalog` | `[]` | Catalog directory; repeatable. Each --catalog is prepended to the catalog search stack (first match wins): the workspace catalog_dirs, or, for a Release the workspace configuration gives directories of its own under workspace.releases, that Release's; the stack ends with the `catalog` directory at the workspace root when there is one. A catalog_dirs list written empty reads no local catalog at all. |
| `--debug` | `false` | Emit human-readable verbose diagnostics on stderr — per-phase wall-clock timing and entity/dependency counts. Wins over --quiet: verbose output always emits. Distinct from --trace, which writes machine-readable per-node intermediate files to .trace/ |
| `--detail` | `false` | Build is read-only by default and prints no resolution detail. When the pull step runs — because --auto-pull was passed or the workspace enables auto_pull — build fills the lockfile in-process whether or not one is already present, and this flag prints per resolved entity what that fill did: fetched fresh from a registry, reused a cache slot, found in a local catalog, served from inside the compiler binary, or external (the Release's own Aggregate or Manifest, read from the file or entry the Release names). When no pull step runs, it prints one line saying so instead of the per-entity rows. Stdout only; not persisted |
| `--disable-plugin-cache` | `false` | Skip the persistent on-disk plugin compile cache for this build and compile plugin guests fresh in an in-memory cache that is discarded when the build ends. Off by default, which reuses the shared on-disk cache across builds. Does not change rendered output |
| `--dry-run` | `false` | Render the Release and print what it would emit instead of writing it: each artifact's would-be path and its content go to stdout, and the output directory and the lockfile are left untouched. External inputs behave exactly as they do in an ordinary build — pinned inputs are served from the content-addressed store (and refilled by digest when the blob is missing), and a render that requests an unpinned external URL halts naming it — so what a dry run shows is what a build would write. Refuses to combine with --auto-pull, --upgrade or --trace, each of which writes — run the dependency fill, or a traced build, as its own step. Combines with --policy-input, whose files are then the one thing it writes |
| `--ir-graph` | `false` | Also write the IR graph this run computed to stdout, as JSON, in addition to everything this command already produces. Values an author declared sensitive are withheld from it; pass --unredacted to print them instead. The artifacts are still written and the summary is still printed; the graph is written ahead of both |
| `--no-unsupported-field-warnings` | `false` | Silence the unsupported-field warning class: the notices a target raises for something you authored that it cannot honor — a Workload field it cannot express (as a lower-fidelity target such as compose does), or an aggrega.ai/ annotation it does not act on for the node's input kind. Other render warnings still surface. Display-only; does not change the rendered output |
| `--policy-input` | — | Write, into this directory, the payload each governance role hands a plugin attached there, as one line of JSON: exactly what the build hands the plugin, every value the build withholds from it withheld. For annotation-transform, label-transform and ir-verdict the file is the `input` document a policy at that role reads. For render-verdict the policy engine reshapes the payload before a policy reads it — each artifact's `documents` are parsed from it — so a render-verdict policy is tested by running the engine itself, `aggrega plugin run-local --plugin <engine.wasm> --export verdict_render --with @<dir>/render-verdict.json`, which gives the build's decision. A role with nothing attached is written too, as the payload an attachment with no sources and no settings would receive, so a policy can be written before it is attached. Each role is written to `<role>.json` (annotation-transform, label-transform, ir-verdict, render-verdict); where the attachments at one role receive different payloads — one carries its own sources or settings, or a transform changes what the next one reads — each is written to `<role>.<position>.<plugin>.json` instead, position counting that role's attachments from 1 in the order the workspace configuration lists them and plugin being the last segment of the plugin's reference without its version, with any character a file name cannot hold escaped. Files of those names already in the directory are replaced and nothing else there is touched. The files are written whether the build finishes or stops, and a build that stops before a role runs names each role it wrote no file for. Asking for them changes no artifact and no verdict. Combines with --dry-run, which then writes these files and nothing else: the output directory and the lockfile are left untouched |
| `--progress` | `false` | Force the build-progress surface on even when stderr is not a terminal, printing one plain line per step as it completes, with its time. The default is auto: the interactive phase checklist is shown only when stderr is a terminal that interprets escape sequences, a terminal that does not gets the same plain lines, and redirected or piped output gets none. --quiet and --debug both override --progress |
| `--quiet` | `false` | Silence the build-progress surface on stderr. Does not affect stdout. Takes precedence over --progress |
| `--release` | — | Path to Release YAML file (required). A relative path resolves against the directory you run the command in, not against the workspace root. Where that directory is in no workspace and no root is named, an absolute path finds the workspace from the Release's own folder |
| `--trace` | `false` | write per-node intermediate files to .trace/ beneath the workspace root, beside dist/, for post-mortem inspection |
| `--trace-unredacted` | `false` | Write the declared-sensitive values into the .trace/ files instead of the <redacted> text that stands in for them, and stamp every file the trace writes with a header saying so. Requires --trace. It reaches .trace/ and nothing else: rendered artifacts, aggrega inspect output and diagnostic text are identical with and without it. Invocation-only — there is no workspace-config setting for it, so it can never be left on for a later build |
| `--unredacted` | `false` | Print the values an author declared sensitive instead of withholding them. Anything the output reaches — a terminal, a pipe, a file, a screen recording — then carries those values in the clear. Reaches the graph --ir-graph writes and nothing else, so it requires --ir-graph; the .trace/ files take --trace-unredacted instead |
| `--upgrade` | `false` | Make the auto-pull step a full refresh: discard the existing lockfile and re-resolve every dependency from current registry state, floating each to the highest available version instead of honoring existing pins. Implies --auto-pull — on its own it runs a full-refresh pull before the build. It takes no target, so it cannot be narrowed to one dependency: to adopt or drop a single pin, run `aggrega pull --upgrade --release <release> <uri>` instead, which holds every other pin unchanged. Because it drops every recorded pin it asks for confirmation first; --yes answers in advance, and on a non-interactive stdin it refuses rather than waiting for an answer nobody can give |
| `--verify-determinism` | `false` | Render every node twice and compare the emitted bytes, halting the build if any node's two renders differ. Off by default. Use it to confirm a provider renders deterministically — identical input yields byte-identical output — which the GitOps-diff and byte-identical-output guarantees rely on |
| `--yes` | `false` | Answer the --upgrade confirmation in advance, for non-interactive use. It reaches that one prompt and nothing else: a build that does not refresh asks nothing, so passing it changes no behaviour there |
<!-- END GENERATED: cli-build -->
