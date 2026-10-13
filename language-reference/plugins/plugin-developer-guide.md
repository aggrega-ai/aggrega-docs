# Wasm plugin developer guide

This is the canonical guide for authoring an Aggrega WebAssembly (Wasm) plugin and publishing it as a catalog entity. It teaches the plugin author's contract end to end: what a plugin is, how a plugin describes itself to the host, how to author its exports and capability claims, the runtime limits and host functions the host applies, the `Plugin` entity that carries a plugin into the catalog, how a Recipe or FeatureRecipe references a plugin, and the publish→pull→build lifecycle that gets a plugin from a `.wasm` file on disk to a verified, digest-pinned artifact a build consumes.

The companion page [`plugin-contract.md`](plugin-contract.md) documents the *sockets* — the pipeline points where plugins attach and the input/output shapes each socket consumes and produces. This guide documents the *plugin* — the entity, the capability surface, and the lifecycle. Read the contract page to learn which socket your plugin targets; read this page to learn how to author and ship it.

For a worked route through the whole task rather than a reference to it, [authoring a provider](authoring-a-provider-walkthrough.md) builds one small provider guest end to end — descriptor, build, entity, attachment, and a render whose output you can read — including the refusal a first draft usually meets and how to read it.

## 1. What a Wasm plugin is

A Wasm plugin is a WebAssembly module that extends the compiler at a designated socket. The Go host binary contains no cloud-specific or infrastructure logic; all domain-specific intelligence — template rendering, format translation, policy evaluation, linting — lives inside plugins. The host orchestrates the pipeline and passes each socket's payload across the ABI boundary to the guest; the guest does the domain work and returns that socket's result shape. Which encoding a payload travels in is fixed per socket and stated in that socket's section of the [plugin contract](plugin-contract.md); either way a guest reads and writes it through the entry points its kit's payload type already carries, so no guest hand-parses bytes.

A plugin runs behind an ahead-of-time-purity firewall. The host loads and executes the module through an embedded Wasm runtime under a capability-denied configuration: no network sockets, no filesystem, no environment, discarded stdio, and an observable wall clock frozen to a build-invariant instant. Any I/O call a guest attempts fails at the call boundary, so a plugin cannot reach for runtime state. Author plugins with this firewall in mind: a plugin transforms the JSON it is handed and returns a result the host consumes verbatim, and determinism is your responsibility — identical input must produce identical output bytes. The one sanctioned channel for remote content is the host-mediated external-input fetch (Section 4), which serves bytes under a digest-pinned discipline rather than giving the guest live network access.

The sockets a plugin can target — among them the mutation gate at topology construction, the validation gate at static analysis, the FeatureRecipe pipeline, the out-of-band linter, and the provider-rendering socket — and their per-socket input/output shapes are documented in [`plugin-contract.md`](plugin-contract.md). Which socket a plugin serves is the one value it declares in `metadata.pluginType`, and the whole set of values that field accepts is the reference entry for it in [`entities/plugin.md`](../entities/plugin.md) §"`metadata.pluginType`". The examples in this guide use `provider` (renders IR nodes into provider-native artifacts), `linter` (inspects authored content and raises diagnostics), and `pipeline-step` (a feature-recipe-pipeline step that transforms IR within a pipeline).

You author the guest against the host through the three-language plugin development kit (PDK) — Go, Rust, or TypeScript. The PDK wraps the underlying Wasm toolchain with Aggrega-typed builders for the input and output shapes each socket carries.

## 2. The `describe()` self-report

Every plugin exports a `describe()` function that returns the plugin's self-report: the socket type(s) it implements, the ABI version it targets, the capabilities it claims — read according to the socket type, so capability names for a provider or a pipeline step and prefixed source formats for a parser or an importer — the host functions it imports, and the per-export capability of each entry point it offers. `describe()` is the plugin's own account of what it is and what it does.

The self-report is the anchor of the trust model. The `Plugin` entity that carries the plugin into the catalog (Section 5) restates the same facts as authored claims, and the host cross-checks the entity's claims against the plugin's `describe()` output at two moments — at publish, before any bytes land in the registry, and at load, before the plugin runs. A mismatch halts loudly. The entity is the human-readable, catalog-visible surface; `describe()` is the machine-of-record the host verifies it against. Author both to agree; the cross-check exists precisely to catch the case where they drift.

## 3. Authoring exports and their capability claims

A plugin offers one or more **exports** — named entry points the host dispatches to (for example `render_node`, `lint_naming`, `step`). Each export carries a capability block: the author's claim of what that export does. An export's capability has four fields:

- **`name`** — the export's ABI name, the name the host dispatches to. Required.
- **`operates`** — the pipeline operation the export performs: `patch` (modify an existing rendered document) or `emit` (add a new document). This is a declared capability claim. The host cross-checks it against the plugin's `describe()` self-report at publish and at load, so the entity's authored claim and the plugin's own account must agree. It is a validated claim about the export, not a dispatch switch: at render time the operation a step actually performs is carried by the guest's returned result, not selected from this field. Absent carries no operation claim.
- **`scope`** — the document root the export operates on: `own` (the node's own rendered documents) or `host` (the documents of the component a component-scope FeatureRecipe is attached to). Before a pipeline step's plugin runs, the host reads the step's declared export scope and enforces that the provider rendering that scope's documents appears in the plugin's `spec.pipelineStep.capabilities` (Section 5) — an `own`-scope export is checked against the provider rendering the node's own documents, a `host`-scope export against the host component's provider, and an empty scope defaults to `own` for this check. This is the provider-compatibility gate, run ahead of the step; the document a guest operation actually touches is named per-operation in the guest's returned result, not selected from this declared field. Absent defaults to `own`.
- **`selector`** — a free-form, human-readable description of what the export acts on (for example `workloads carrying a pod template`). Documentation for catalog readers and the `aggrega inspect` surface; the compiler does not interpret it.

Author exports in the order you want them read; entries preserve author order on the entity and in `inspect`. A plugin with no authored exports declares no export surface — valid for a plugin whose socket does not need a per-export capability claim.

## 4. Runtime limits and host functions

A plugin entity may carry an optional `runtime` block that constrains how the host loads and runs the plugin.

**Memory and time limits.** `maxMemoryPages` caps the plugin's linear memory in Wasm pages (64 KiB per page); `timeoutMs` caps how long the plugin's own code may run during one call, in milliseconds. Time spent inside the host functions the plugin calls does not count against it. On Linux the measure is the processor time of the thread running the guest, so time the guest spends waiting for a processor on a busy machine does not count either; on other systems it is elapsed time. The first call to a freshly loaded plugin also counts the guest language runtime's one-time initialization, which runs inside that call. Both limits are optional-with-defaults: zero or absent applies the platform default cap. The loader caps every plugin at the platform default when the entity declares none, so a load is never unbounded and a call is never uncancellable. Raise a limit on the entity when an attachment genuinely needs more memory or more time than the default allows.

**Host functions.** `hostFunctions` records the host function names the plugin imports. It is a **machine-derived field — do not author it.** Publish reads the host functions directly from the `.wasm` import section and stamps the field into the entity for you; the value reflects the published binary, so a plugin gets exactly the host functions its binary actually imports, validated against a curated allowlist (an import outside the allowlist is rejected loudly). The stamp is a snapshot of the published binary, the same way the content-addressed `plugin:` reference is a snapshot of the published bytes: it reflects the binary at publish time and is re-derived and verified when the plugin is pulled. To see the host functions a local `.wasm` imports before publishing — the value publish will stamp — run `aggrega inspect --plugin <file.wasm>`.

**The curated host surface.** Three of the host functions are general-purpose: `aggrega_log` (a level and a message, emitted as one log line on the host's log destination), `aggrega_emit_warning` (a code, a message, and a path, accumulated as a structured warning the host surfaces after the call), and `aggrega_fetch_external_input` (a URL, answered with the input's bytes under the pin discipline below). The PDK wraps all three in each language — Go: `aggrega.Log`, `aggrega.EmitWarning`, `aggrega.FetchExternalInput`; Rust: `log`, `emit_warning`, `fetch_external_input`; TypeScript: `log`, `emitWarning`, `fetchExternalInput` — so a guest calls a typed function rather than the raw ABI. The source and parse callbacks — for a guest that reads slices of an acquired source or obtains a parsed tree through the host — and the encoding each callback's slots carry are listed in [`plugin-contract.md`](plugin-contract.md).

**Local source content comes in the payload — never from the filesystem.** A provider render plugin never reads its source from disk; a filesystem call fails at the call boundary. The host reads the local source (for example a Helm chart's directory) at compile time and hands it to the guest inside the render payload as a **source projection**: every file's source-root-relative path and raw bytes, in the host's deterministic walk order. The guest reconstructs the source in memory and renders from the payload alone. The per-socket payload shapes are documented in [`plugin-contract.md`](plugin-contract.md).

**Remote content comes through the external-input fetch.** A plugin that needs remote content — a chart archive, a remote schema document — calls the PDK's fetch wrapper. On the wire the guest passes the URL to `aggrega_fetch_external_input` as UTF-8 text and receives one reply in canonical CBOR, carrying either the fetched bytes, raw, or an error message beside its machine-matchable code; the wrapper decodes the reply into bytes-or-error. The bytes arrive exactly as fetched, including a payload that is not valid UTF-8, and a zero-length payload comes back as empty bytes rather than an error. The host serves the URL under the external-input pin discipline:

- A URL already pinned in the Release's lockfile is served from the local content-addressed store and verified against its recorded digest on every read. A missing store blob is refilled from the network by the recorded digest — a digest-verified refill cannot change output.
- An unpinned URL is refused, with an error naming the URL and the remedy. A build renders the closure its lockfile records, so no build fetches an unpinned reference and there is no setting that makes one.
- Pinning happens when the Release's dependencies are resolved: `aggrega pull` renders the Release to find out which external inputs its render requests, fetches each one, and records it in the lockfile beside the dependency pins. So a plugin author's loop is resolve once, then build offline as often as you like.

Allowed schemes are `https`, `http` to loopback hosts only, and `oci` (pinned by manifest digest). The lockfile records every pinned input — its URL, `sha256` digest, size, and the plugins that required it — so a re-build serves the same bytes from the local store: reproducible, and offline once pinned.

With the Go PDK:

```go
import "github.com/aggrega-ai/aggrega-pdk-go/pkg/aggrega"

chart, err := aggrega.FetchExternalInput("https://charts.example.com/postgresql-16.3.2.tgz")
if err != nil {
    // The error names the URL and the remedy — an unpinned URL reports exactly
    // what to pin and how. Surface it as a render failure; do not mask it.
    return fmt.Errorf("fetching chart archive: %w", err)
}
```

**What fails, and why.**

- A filesystem or network call fails at the call boundary: the guest holds no preopened directories and no sockets. This applies to every code path, including a library dependency that tries to read a file — read the source projection instead.
- An import under a module outside `wasi_snapshot_preview1`, `extism:host/env`, and `extism:host/user` fails at load, with a diagnostic naming the module and the import. Individual WASI function names within an allowed module are never censored — a statically-linked language runtime's unused filesystem and socket imports are fine, because naming an import grants nothing.
- A fetch of a URL the lockfile does not pin fails with an error naming the URL; the remedy is to run `aggrega pull --release <release>`, which pins every external input the Release's render consumes, and then build.

There is no host-allowlist field for outbound network access. A plugin never reaches the network at build time — that is the ahead-of-time boundary — so no such field exists to author. Remote content arrives through the host-mediated, digest-pinned external-input channel above, never through ambient network access.

**Configuration.** `configKV` is a string-to-string map the runtime hands the plugin at start. Entries preserve author order so the emitted record is byte-identical across runs. Absent leaves the runtime's default empty configuration in effect.

## 5. The `Plugin` entity

A plugin enters the catalog as a `Plugin` entity — the authoring and metadata surface for the plugin. The entity declares what the plugin is and points at the `.wasm` artifact; the compiler is blind to the plugin's behaviour and routes the pinned reference, while the Wasm runtime executes the bytes.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Plugin
metadata:
  name: aws-secrets-manager
  version: 1.2.0
  pluginType: pipeline-step
spec:
  abiVersion: v1alpha1
  pipelineStep:
    capabilities:
      - helm
      - compose
  signature:
    type: sigstore-cosign
  runtime:
    maxMemoryPages: 256
    timeoutMs: 5000
    # hostFunctions is stamped by publish from the .wasm — do not author it.
  exports:
    - name: fetch
      operates: emit
      scope: own
      selector: external-secret resources for the bound credential
```

The fields:

- **No artifact-location field, deliberately.** The entity carries no pointer to the `.wasm` and the schema accepts none. A plugin's artifact location is *derived* from its identity — the `metadata.pluginType`/`metadata.name` coordinate, which forms the repository path `plugin/<pluginType>/<name>` — plus whichever registry the workspace is configured against, so there is no location to author and none to get wrong. The resolved content digest is recorded per Release in that Release's lockfile, and the build verifies the fetched bytes against it: identity in the entity, verified bytes in the lockfile.
- **`metadata.version`** — the release the entity publishes, which has to equal the guest's own build-provenance version as reported in `describe()`. A plugin author versions the `.wasm` at build time — the build stamps the version into the guest, and a build that takes it from a release tag stamps the release version only on the commit that tag names — and the entity's `metadata.version` names that same release. The publish door cross-checks the two and halts on a divergence, so the entity always names the exact version of the binary it ships. `aggrega plugin gen-catalog --plugin` (below) copies the version the guest reports into the entity it generates, which is the release version when the guest was built from the tagged commit. Required.
- **`metadata.pluginType`** — the socket type this plugin implements, drawn from `provider`, `linter`, `pipeline-step`, `governance`, `cli`, `parser`, and `importer`. A plugin implements exactly one. It sits in the addressing block beside `name` and `version` and supplies the `<pluginType>` segment of the derived coordinate. Required.
- **`spec.abiVersion`** — the host/guest ABI version the plugin targets. `v1alpha1` is the accepted value; a future ABI revision adds an accepted value. Required.
- **The block for your socket type, carrying `capabilities`** — a plugin declares what it serves inside the block belonging to its `metadata.pluginType`, and the block is what fixes what an entry means. `spec.provider.capabilities` names the capabilities a provider serves (capability names such as `helm` or `compose`). `spec.pipelineStep.capabilities` names the providers whose rendered output your step is compatible with. `spec.parser.capabilities` names the source formats a parser reads, each written `parse:<format>`. `spec.importer.capabilities` names the foreign formats an importer drafts entities from, each written `import:<format>`. An importer written in Go can take everything that does not depend on its format — the scoring, the decision to reference or draft, the drafts and their rendering, and its settings — from the Go kit's importer package, `github.com/aggrega-ai/aggrega-pdk-go/pkg/importer`. A `linter`, `governance`, or `cli` plugin serves no capability and carries none of the four blocks. Entries preserve author order, and every list is an explicit, tested claim: declare what you have actually built and tested the plugin against, because a consumer resolves against exactly what is listed. For a pipeline step that claim is enforced at render — when a step touches a scope, the build halts unless the provider rendering that scope's documents is among the ones your plugin claims — so an empty list matches no provider and admits the step nowhere.
- **`spec.signature`** — an optional descriptive pointer to the plugin's attached signature (Section 8). This block is documentation only: it records where the signature lives and how it was produced for catalog readers; it does not itself admit the plugin. The enforcing check is the per-registry trust policy applied at pull.
- **`spec.runtime`** — the optional execution-constraints block from Section 4. The author writes `maxMemoryPages`, `timeoutMs`, and `configKV`; `hostFunctions` is machine-derived and stamped by publish, not authored.
- **`spec.exports`** — the per-export capability claims from Section 3 (`name`, `operates`, `scope`, `selector`).

**Generating the entity from your `.wasm`.** You do not have to hand-write the machine-owned parts of the entity. `aggrega plugin gen-catalog --plugin <file.wasm>` reads the guest's `describe()` self-report and produces a publish-ready `Plugin` entity from it plus a small authored overlay you supply (the identity, runtime limits, and any provider block). The generator stamps the fields the binary is the source of truth for — the export claims, the capability contract, the command mirror, and the host-function record — and copies `metadata.version` from the guest's `describe()` build-provenance version, while the overlay supplies only what the binary does not report. This is the supported path for a third-party plugin author: build and version your `.wasm`, then regenerate the entity so its machine-owned fields stay in lockstep with the binary. The version is the one copied field that names a release rather than a fact about the bytes, so generate from a build of the commit the release's tag names — or, starting from a development build, set `metadata.version` to the release in the generated entity before you tag the commit that carries it. A guest that carries no build-provenance version cannot be generated into a versioned entity — version the guest at build time first.

For the field-by-field reference, see the entity page [`../entities/plugin.md`](../entities/plugin.md).

## 6. Referencing a plugin

A pipeline step or a plugin socket references a plugin by its **`Plugin` entity URI** — the entity's identity, not the `.wasm` artifact directly. The entity is the layer that carries the digest pin, the capability claims, the runtime limits, and the signature; referencing the entity is how a consumer picks up all of it.

A bare `.wasm` path or a raw artifact reference left in a `plugin` field is rejected at load: no `Plugin` entity matches it, so plugin resolution fails loudly. The entity URI is mandatory — the indirection through the entity is the contract, not an optional convenience. A FeatureRecipe pipeline step names the entity in `pipeline[].plugin`; see [`../entities/featurerecipe.md`](../entities/featurerecipe.md) for the pipeline authoring surface.

When two or more plugins are coupled — they must agree on a shared hand-off contract, as in a Fetcher and Injector pair where one plugin's output is the other's input (the Two-Part Plugin Principle described in [`plugin-contract.md`](plugin-contract.md)) — author that contract once and have each plugin depend on the single definition rather than restating the JSON hand-off shape independently in each plugin. The shared shape is the JSON structure the plugins exchange, which can live in a single SchemaLibrary entry both plugins reference. A single source for the contract keeps coupled plugins in sync as it evolves; independent restatements drift, and the drift surfaces only when the two no longer agree at runtime. The recommendation is to share the contract, not the Wasm code — each plugin remains its own artifact.

## 7. The publish → pull → build lifecycle

A plugin moves from a `.wasm` file on disk to a build-consumable, verified artifact through three stages.

**Publish.** `aggrega push` publishes a `Plugin` entity and its `.wasm` together as a **single** OCI manifest, tagged by `metadata.version`: the entity YAML is the manifest's config blob and the `.wasm` rides as a layer of the same manifest. Publishing the pair as one tagged manifest is what makes the push atomic — there is no window in which one half is published and the other is not — and it is why one signature over that manifest covers both halves. Both halves are named on the manifest, so a generic OCI client pulling the version tag writes the entity to `entity.yaml` and the executable to `entity.wasm`.

Before any bytes land, publish runs its checks. The entity is read against the `Plugin` schema first, the way a catalog load reads it, so a `metadata.version` that is not a semantic version — or any other departure from the schema — is refused before the `.wasm` is read. The `.wasm` is then loaded and its `describe()` self-report is cross-checked against the entity's authored capability claims — a mismatch halts loudly, so a published entity never disagrees with the plugin it ships. A guest whose `describe()` build-provenance version carries the `-dirty` mark a build from a working tree with uncommitted changes is stamped with is refused: that version names a commit that does not hold what was built. A development version built from a commit (`1.0.0-3-g1a2b3c4`) and a prerelease (`1.0.0-rc.1`) publish. The recorded `metadata.version` is cross-checked against the guest's `describe()` build-provenance version, and a divergence halts the publish, so the two must agree. Both refusals are cleared the same way: build the plugin from a clean checkout of the commit the release's tag names, so it reports the release version itself — for a new release, commit the entity with the source it releases and tag that commit first. Copying the version a development build reports into the entity is not a repair: it publishes that build under a version no release tag names. The host functions the `.wasm` imports are derived from the binary and compared with the record committed in `spec.runtime.hostFunctions`; a divergence halts the publish and names `aggrega plugin sync`, which re-records the field, because the field is machine-owned and a publish never rewrites the committed entity file. The published entity carries the stamped host-function record; the `.wasm` content digest is a property of the manifest the pair publishes as, and it is recorded for a consumer in the Release lockfile rather than written into the entity.

**Pull.** `aggrega pull` resolves all of a Release's dependencies and writes a per-Release lockfile pinning every catalog entity and remote artifact to a version and content digest. A published `Plugin` resolves through this dependency resolution; its `.wasm` is fetched with the manifest that carries it and the bytes are verified against the content digest the lockfile records. Pull also re-derives the host functions from the verified `.wasm` and checks them against the stamped `hostFunctions` record, halting if the two disagree — a defense-in-depth check over the digest pin that catches a binary whose stamp was not produced from its own imports. If the registry's trust policy requires signatures, the entity's signature is fetched and verified at this stage and recorded as a verified fact in the lockfile (Section 8). Verification happens at pull, never at build — the build stays ahead-of-time-pure.

**Build.** `aggrega build` consumes the pinned, verified plugin from the resolved dependencies. The compiler routes the digest-pinned reference and the Wasm runtime executes the bytes; the load gate re-runs the `describe()` cross-check and the host-function and runtime-limit enforcement before the plugin runs.

## 8. Signing and trust

A `Plugin` entity is signed exactly as every other catalog entity: the manifest's digest is signed and attached as an OCI referrer. The `.wasm` artifact is not signed separately, and it needs no separate signature — it is a layer of the very manifest whose digest is signed, so the signature covers it directly: tampering with the `.wasm` changes the manifest digest and breaks the signature.

Signing is opt-in at publish; verification is enforced by the per-registry trust policy at pull. A registry configured to require signatures halts the pull when a required signature is missing, untrusted, or invalid. The `spec.signature` block on the entity is a documentation pointer to where the signature lives and how it was produced; it records facts for catalog readers and does not itself gate admission. The gate is the pull-time policy.

The commands and their flags are documented with the publishing and consume surfaces — see [`../cli/aggrega-sign.md`](../cli/aggrega-sign.md), [`../cli/aggrega-push.md`](../cli/aggrega-push.md), and [`../cli/aggrega-pull.md`](../cli/aggrega-pull.md). This guide does not restate the flag tables; those pages are the single home for the command surface.

## 9. Versioning the entity

A `Plugin` entity carries a strict Semantic Version in `metadata.version`. A published version is immutable: re-publishing a version that already exists in the registry with different content is rejected at the publish gate.

When you change a plugin entity and re-publish, the publishing discipline classifies the change against the previously published version and requires the version bump to match. The classification is the version-bump rubric: a documentation- or comment-only change is `PATCH`; a strictly additive change (a new optional field, a new entry) is `MINOR`; a removal, a type narrowing, or a previously-optional field becoming required is `MAJOR`. Over-bumping is always allowed; under-bumping halts with a diagnostic naming the required bump. The first publication of an entity skips the bump check and surfaces a warning that no verification was performed. Run the check before publishing with `aggrega lint --pre-publish`; see [`../cli/aggrega-lint.md`](../cli/aggrega-lint.md) for the full rubric and the per-rule settings.

A `Plugin` has no `extends` surface, so the inheritance rules that govern the catalog's Components and Features do not reach it. The version-bump rubric and immutability are the versioning discipline that governs a plugin entity.

## 10. Cross-references

- [`authoring-a-provider-walkthrough.md`](authoring-a-provider-walkthrough.md) — one provider guest built end to end, from an empty directory to rendered output.
- [`plugin-contract.md`](plugin-contract.md) — the socket points a plugin targets and the per-socket input/output shapes.
- [`policy-socket.md`](policy-socket.md) — the governance socket in depth: its four roles, the verdict severities, the operator input channel, writing a policy for either of the two engines that ship inside the compiler, and the reference policy guests.
- [`../entities/plugin.md`](../entities/plugin.md) — the `Plugin` entity field-by-field reference.
- [`../entities/featurerecipe.md`](../entities/featurerecipe.md) — the FeatureRecipe `pipeline:` authoring surface that references a plugin by entity URI.
- [`../cli/aggrega-lint.md`](../cli/aggrega-lint.md) — the publishing-linter, the version-bump rubric, and immutability enforcement.
- [`../cli/aggrega-inspect.md`](../cli/aggrega-inspect.md) — inspecting a `Plugin` entity's capabilities, runtime limits, and signature.
- [`../cli/aggrega-push.md`](../cli/aggrega-push.md), [`../cli/aggrega-pull.md`](../cli/aggrega-pull.md), [`../cli/aggrega-sign.md`](../cli/aggrega-sign.md) — the publish, consume, and signing command surfaces.
