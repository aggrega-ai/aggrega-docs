# Wasm plugin developer guide

This is the canonical guide for authoring an Aggrega WebAssembly (Wasm) plugin and publishing it as a catalog entity. It teaches the plugin author's contract end to end: what a plugin is, how a plugin describes itself to the host, how to author its exports and capability claims, the runtime limits and host functions the host applies, the `Plugin` entity that carries a plugin into the catalog, how a Recipe or FeatureRecipe references a plugin, and the publish→pull→build lifecycle that gets a plugin from a `.wasm` file on disk to a verified, digest-pinned artifact a build consumes.

The companion page [`plugin-contract.md`](plugin-contract.md) documents the *sockets* — the pipeline points where plugins attach and the input/output shapes each socket consumes and produces. This guide documents the *plugin* — the entity, the capability surface, and the lifecycle. Read the contract page to learn which socket your plugin targets; read this page to learn how to author and ship it.

## 1. What a Wasm plugin is

A Wasm plugin is a WebAssembly module that extends the compiler at a designated socket. The Go host binary contains no cloud-specific or infrastructure logic; all domain-specific intelligence — template rendering, format translation, policy evaluation, linting — lives inside plugins. The host orchestrates the pipeline and passes each socket's payload across the ABI boundary to the guest; the guest does the domain work and returns that socket's result shape. Which encoding a payload travels in is fixed per socket and stated in that socket's section of the [plugin contract](plugin-contract.md); either way a guest reads and writes it through the entry points its kit's payload type already carries, so no guest hand-parses bytes.

A plugin runs behind an ahead-of-time-purity firewall. The host loads and executes the module through an embedded Wasm runtime under a capability-denied configuration: no network sockets, no filesystem, no environment, discarded stdio, and an observable wall clock frozen to a build-invariant instant. Any I/O call a guest attempts fails at the call boundary, so a plugin cannot reach for runtime state. Author plugins with this firewall in mind: a plugin transforms the JSON it is handed and returns a result the host consumes verbatim, and determinism is your responsibility — identical input must produce identical output bytes. The one sanctioned channel for remote content is the host-mediated external-input fetch (Section 4), which serves bytes under a digest-pinned discipline rather than giving the guest live network access.

The sockets a plugin can target — the mutation gate at topology construction, the validation gate at static analysis, the FeatureRecipe pipeline, the out-of-band linter, and the provider-rendering socket — and their per-socket input/output shapes are documented in [`plugin-contract.md`](plugin-contract.md). The plugin-type taxonomy the runtime recognises is `provider` (renders IR nodes into provider-native artifacts), `linter` (inspects authored content and raises diagnostics), and `pipeline-step` (a feature-recipe-pipeline step that transforms IR within a pipeline).

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

**Memory and time limits.** `maxMemoryPages` caps the plugin's linear memory in Wasm pages (64 KiB per page); `timeoutMs` caps per-call execution wall time in milliseconds. Both are optional-with-defaults: zero or absent applies the platform default cap. The loader caps every plugin at the platform default when the entity declares none, so a load is never unbounded and a call is never uncancellable. Raise a limit on the entity when an attachment genuinely needs more memory or more time than the default allows.

**Host functions.** `hostFunctions` records the host function names the plugin imports. It is a **machine-derived field — do not author it.** Publish reads the host functions directly from the `.wasm` import section and stamps the field into the entity for you; the value reflects the published binary, so a plugin gets exactly the host functions its binary actually imports, validated against a curated allowlist (an import outside the allowlist is rejected loudly). The stamp is a snapshot of the published binary, the same way the content-addressed `plugin:` reference is a snapshot of the published bytes: it reflects the binary at publish time and is re-derived and verified when the plugin is pulled. To see the host functions a local `.wasm` imports before publishing — the value publish will stamp — run `aggrega inspect --plugin <file.wasm>`.

**The curated host surface.** Three host functions exist: `aggrega_log` (a level and a message, emitted as one log line on the host's log destination), `aggrega_emit_warning` (a code, a message, and a path, accumulated as a structured warning the host surfaces after the call), and `aggrega_fetch_external_input` (a URL, answered with the input's bytes under the pin discipline below). The PDK wraps all three in each language — Go: `aggrega.Log`, `aggrega.EmitWarning`, `aggrega.FetchExternalInput`; Rust: `log`, `emit_warning`, `fetch_external_input`; TypeScript: `log`, `emitWarning`, `fetchExternalInput` — so a guest calls a typed function rather than the raw ABI.

**Local source content comes in the payload — never from the filesystem.** A provider render plugin never reads its source from disk; a filesystem call fails at the call boundary. The host reads the local source (for example a Helm chart's directory) at compile time and hands it to the guest inside the render payload as a **source projection**: every file's source-root-relative path and raw bytes, in the host's deterministic walk order. The guest reconstructs the source in memory and renders from the payload alone. The per-socket payload shapes are documented in [`plugin-contract.md`](plugin-contract.md).

**Remote content comes through the external-input fetch.** A plugin that needs remote content — a chart archive, a remote schema document — calls the PDK's fetch wrapper. On the wire the guest passes a URL to `aggrega_fetch_external_input` and receives a JSON envelope carrying either the content (base64-encoded) or an error message; the wrapper decodes the envelope into bytes-or-error. The host serves the URL under the external-input pin discipline:

- A URL already pinned in the Release's lockfile is served from the local content-addressed store and verified against its recorded digest on every read. A missing store blob is refilled from the network by the recorded digest in every mode — a digest-verified refill cannot change output.
- An unpinned URL is fetched, pinned into the store under its digest, and recorded for the lockfile when acquisition is enabled — the `aggrega build` default.
- Under `aggrega build --no-acquire-inputs` the external-input set is frozen: an unpinned URL is refused with an error naming the URL and the remedy. Pinned inputs are still served.
- `aggrega acquire` runs only the acquisition pass: it fetches and pins every external input the Release's render requests, discarding the rendered output, so a subsequent frozen build serves everything from the store.

Allowed schemes are `https`, `http` to loopback hosts only, and `oci` (pinned by manifest digest). The lockfile records every pinned input — its URL, `sha256` digest, size, and the plugins that required it — so a re-build serves the same bytes from the local store: reproducible, and offline once pinned.

With the Go PDK:

```go
import "github.com/aggrega-ai/aggrega-pdk-go/pkg/aggrega"

chart, err := aggrega.FetchExternalInput("https://charts.example.com/postgresql-16.3.2.tgz")
if err != nil {
    // The error names the URL and the remedy — under a frozen external-input set an
    // unpinned URL reports exactly what to pin and how. Surface it as a
    // render failure; do not mask it.
    return fmt.Errorf("fetching chart archive: %w", err)
}
```

**What fails, and why.**

- A filesystem or network call fails at the call boundary: the guest holds no preopened directories and no sockets. This applies to every code path, including a library dependency that tries to read a file — read the source projection instead.
- An import under a module outside `wasi_snapshot_preview1`, `extism:host/env`, and `extism:host/user` fails at load, with a diagnostic naming the module and the import. Individual WASI function names within an allowed module are never censored — a statically-linked language runtime's unused filesystem and socket imports are fine, because naming an import grants nothing.
- An unpinned fetch in a frozen build (`--no-acquire-inputs`) fails with an error naming the URL; the remedy is to rebuild with acquisition enabled or run `aggrega acquire --release <release>` to fetch and pin the Release's inputs first.

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
  plugin: "oci://hub.aggrega.ai/plugin/pipeline-step/aws-secrets-manager"
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

- **`spec.plugin`** — the digest-free content reference to the `.wasm` artifact, in the form `oci://<repository>`. The repository path is the plugin's derived coordinate `plugin/<pluginType>/<name>`. Together with `metadata.version` it is the plugin's identity. The content digest is not carried in the entity; it is resolved at `aggrega pull` and recorded in the release lockfile, and the build verifies the fetched bytes against the recorded digest — identity in the entity, verified bytes in the lockfile. Required.
- **`metadata.version`** — the entity's version, which mirrors the guest's own build-provenance version as reported in `describe()`. It is not a free-form authored field: a plugin author versions the `.wasm` at build time (the build stamps the version into the guest), and the entity's `metadata.version` restates that same version. The publish door cross-checks the two and halts on a divergence, so the entity always names the exact version of the binary it ships. Generating the entity with `aggrega plugin gen-catalog --plugin` (below) copies the version across for you. Required.
- **`metadata.pluginType`** — the socket type this plugin implements, drawn from `provider`, `linter`, `pipeline-step`, `governance`, `cli`, `parser`, and `importer`. A plugin implements exactly one. It sits in the addressing block beside `name` and `version` and supplies the `<pluginType>` segment of the derived coordinate. Required.
- **`spec.abiVersion`** — the host/guest ABI version the plugin targets. `v1alpha1` is the accepted value; a future ABI revision adds an accepted value. Required.
- **The block for your socket type, carrying `capabilities`** — a plugin declares what it serves inside the block belonging to its `metadata.pluginType`, and the block is what fixes what an entry means. `spec.provider.capabilities` names the capabilities a provider serves (capability names such as `helm` or `compose`). `spec.pipelineStep.capabilities` names the providers whose rendered output your step is compatible with. `spec.parser.capabilities` names the source formats a parser reads, each written `parse:<format>`. `spec.importer.capabilities` names the foreign formats an importer drafts entities from, each written `import:<format>`. A `linter`, `governance`, or `cli` plugin serves no capability and carries none of the four blocks. Entries preserve author order, and every list is an explicit, tested claim: declare what you have actually built and tested the plugin against, because a consumer resolves against exactly what is listed. For a pipeline step that claim is enforced at render — when a step touches a scope, the build halts unless the provider rendering that scope's documents is among the ones your plugin claims — so an empty list matches no provider and admits the step nowhere.
- **`spec.signature`** — an optional descriptive pointer to the plugin's attached signature (Section 8). This block is documentation only: it records where the signature lives and how it was produced for catalog readers; it does not itself admit the plugin. The enforcing check is the per-registry trust policy applied at pull.
- **`spec.runtime`** — the optional execution-constraints block from Section 4. The author writes `maxMemoryPages`, `timeoutMs`, and `configKV`; `hostFunctions` is machine-derived and stamped by publish, not authored.
- **`spec.exports`** — the per-export capability claims from Section 3 (`name`, `operates`, `scope`, `selector`).

**Generating the entity from your `.wasm`.** You do not have to hand-write the machine-owned parts of the entity. `aggrega plugin gen-catalog --plugin <file.wasm>` reads the guest's `describe()` self-report and produces a publish-ready `Plugin` entity from it plus a small authored overlay you supply (the identity, runtime limits, and any provider block). The generator stamps the fields the binary is the source of truth for — the export claims, the capability contract, the command mirror, the host-function record, and `metadata.version` (copied from the guest's `describe()` build-provenance version) — while the overlay supplies only what the binary does not report. This is the supported path for a third-party plugin author: build and version your `.wasm`, then regenerate the entity so its machine-owned fields, `metadata.version` included, stay in lockstep with the binary. A guest that carries no build-provenance version cannot be generated into a versioned entity — version the guest at build time first.

For the field-by-field reference, see the entity page [`../entities/plugin.md`](../entities/plugin.md).

## 6. Referencing a plugin

A pipeline step or a plugin socket references a plugin by its **`Plugin` entity URI** — the entity's identity, not the `.wasm` artifact directly. The entity is the layer that carries the digest pin, the capability claims, the runtime limits, and the signature; referencing the entity is how a consumer picks up all of it.

A bare `.wasm` path or a raw artifact reference left in a `plugin` field is rejected at load: no `Plugin` entity matches it, so plugin resolution fails loudly. The entity URI is mandatory — the indirection through the entity is the contract, not an optional convenience. A FeatureRecipe pipeline step names the entity in `pipeline[].plugin`; see [`../entities/featurerecipe.md`](../entities/featurerecipe.md) for the pipeline authoring surface.

When two or more plugins are coupled — they must agree on a shared hand-off contract, as in a Fetcher and Injector pair where one plugin's output is the other's input (the Two-Part Plugin Principle described in [`plugin-contract.md`](plugin-contract.md)) — author that contract once and have each plugin depend on the single definition rather than restating the JSON hand-off shape independently in each plugin. The shared shape is the JSON structure the plugins exchange, which can live in a single SchemaLibrary entry both plugins reference. A single source for the contract keeps coupled plugins in sync as it evolves; independent restatements drift, and the drift surfaces only when the two no longer agree at runtime. The recommendation is to share the contract, not the Wasm code — each plugin remains its own artifact.

## 7. The publish → pull → build lifecycle

A plugin moves from a `.wasm` file on disk to a build-consumable, verified artifact through three stages.

**Publish.** `aggrega push` publishes a `Plugin` entity together with its `.wasm` artifact as two ordered OCI artifacts. The `.wasm` lands first, addressed by its content digest; the entity lands second, referencing the `.wasm` by that digest in `spec.plugin`. The ordering plus the content-digest pin makes a partial push safe: a failed entity push leaves only an orphan `.wasm` addressed by digest, with no entity tag, so a retry is clean.

Before any bytes land, publish runs its checks. The `.wasm` is loaded and its `describe()` self-report is cross-checked against the entity's authored capability claims — a mismatch halts loudly, so a published entity never disagrees with the plugin it ships. The recorded `metadata.version` is cross-checked against the guest's `describe()` build-provenance version; a divergence — the signature of a hand-edit that moved the recorded version off the binary — halts the publish, so the two must agree. Regenerating the entity with `aggrega plugin gen-catalog --plugin` keeps them in sync. The `.wasm` content digest is computed once and stamped into `spec.plugin`; if the on-disk `spec.plugin` already pins a digest, it must equal the computed one or the publish halts. The host functions the `.wasm` imports are derived from the binary and stamped into `spec.runtime.hostFunctions` (a divergent on-disk value is overwritten with a warning, since the field is machine-owned). The published entity carries the resolved, digest-pinned reference and the stamped host-function record.

**Pull.** `aggrega pull` resolves all of a Release's dependencies and writes a per-Release lockfile pinning every catalog entity and remote artifact to a version and content digest. A published `Plugin` resolves through this dependency resolution; its `.wasm` is fetched by the content-digest pin in `spec.plugin` and the bytes are verified against that digest. Pull also re-derives the host functions from the verified `.wasm` and checks them against the stamped `hostFunctions` record, halting if the two disagree — a defense-in-depth check over the digest pin that catches a binary whose stamp was not produced from its own imports. If the registry's trust policy requires signatures, the entity's signature is fetched and verified at this stage and recorded as a verified fact in the lockfile (Section 8). Verification happens at pull, never at build — the build stays ahead-of-time-pure.

**Build.** `aggrega build` consumes the pinned, verified plugin from the resolved dependencies. The compiler routes the digest-pinned reference and the Wasm runtime executes the bytes; the load gate re-runs the `describe()` cross-check and the host-function and runtime-limit enforcement before the plugin runs.

## 8. Signing and trust

A `Plugin` entity is signed exactly as every other catalog entity: the entity manifest's digest is signed and attached as an OCI referrer. The `.wasm` artifact is not signed separately — the signed entity commits to the `.wasm` content digest through `spec.plugin`, so the entity signature transitively covers the artifact: tampering with the `.wasm` breaks the digest pin the signed entity asserts.

Signing is opt-in at publish; verification is enforced by the per-registry trust policy at pull. A registry configured to require signatures halts the pull when a required signature is missing, untrusted, or invalid. The `spec.signature` block on the entity is a documentation pointer to where the signature lives and how it was produced; it records facts for catalog readers and does not itself gate admission. The gate is the pull-time policy.

The commands and their flags are documented with the publishing and consume surfaces — see [`../cli/aggrega-sign.md`](../cli/aggrega-sign.md), [`../cli/aggrega-push.md`](../cli/aggrega-push.md), and [`../cli/aggrega-pull.md`](../cli/aggrega-pull.md). This guide does not restate the flag tables; those pages are the single home for the command surface.

## 9. Versioning the entity

A `Plugin` entity carries a strict Semantic Version in `metadata.version`. A published version is immutable: re-publishing a version that already exists in the registry is rejected at the publish gate.

When you change a plugin entity and re-publish, the publishing discipline classifies the change against the previously published version and requires the version bump to match. The classification is the version-bump rubric: a documentation- or comment-only change is `PATCH`; a strictly additive change (a new optional field, a new entry) is `MINOR`; a removal, a type narrowing, or a previously-optional field becoming required is `MAJOR`. Over-bumping is always allowed; under-bumping halts with a diagnostic naming the required bump. The first publication of an entity skips the bump check and surfaces a warning that no verification was performed. Run the check before publishing with `aggrega lint --pre-publish`; see [`../cli/aggrega-lint.md`](../cli/aggrega-lint.md) for the full rubric and the per-rule settings.

A `Plugin` has no `extends` surface, so the inheritance rules that govern the catalog's Components and Features do not reach it. The version-bump rubric and immutability are the versioning discipline that governs a plugin entity.

## 10. Cross-references

- [`plugin-contract.md`](plugin-contract.md) — the socket points a plugin targets and the per-socket input/output shapes.
- [`policy-socket.md`](policy-socket.md) — the governance socket in depth: its four roles, the verdict severities, the operator input channel, writing a policy for the Rego engine that ships inside the compiler, and the reference policy guests.
- [`../entities/plugin.md`](../entities/plugin.md) — the `Plugin` entity field-by-field reference.
- [`../entities/featurerecipe.md`](../entities/featurerecipe.md) — the FeatureRecipe `pipeline:` authoring surface that references a plugin by entity URI.
- [`../cli/aggrega-lint.md`](../cli/aggrega-lint.md) — the publishing-linter, the version-bump rubric, and immutability enforcement.
- [`../cli/aggrega-inspect.md`](../cli/aggrega-inspect.md) — inspecting a `Plugin` entity's capabilities, runtime limits, and signature.
- [`../cli/aggrega-push.md`](../cli/aggrega-push.md), [`../cli/aggrega-pull.md`](../cli/aggrega-pull.md), [`../cli/aggrega-sign.md`](../cli/aggrega-sign.md) — the publish, consume, and signing command surfaces.
