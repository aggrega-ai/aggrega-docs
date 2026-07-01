# Wasm plugin developer guide

This is the canonical guide for authoring an Aggrega WebAssembly (Wasm) plugin and publishing it as a catalog entity. It teaches the plugin author's contract end to end: what a plugin is, how a plugin describes itself to the host, how to author its exports and capability claims, the runtime limits and host functions the host applies, the `Plugin` entity that carries a plugin into the catalog, how a Recipe or FeatureRecipe references a plugin, and the publish→pull→build lifecycle that gets a plugin from a `.wasm` file on disk to a verified, digest-pinned artifact a build consumes.

The companion page [`plugin-contract.md`](plugin-contract.md) documents the *sockets* — the pipeline points where plugins attach and the input/output shapes each socket consumes and produces. This guide documents the *plugin* — the entity, the capability surface, and the lifecycle. Read the contract page to learn which socket your plugin targets; read this page to learn how to author and ship it.

## 1. What a Wasm plugin is

A Wasm plugin is a WebAssembly module that extends the compiler at a designated socket. The Go host binary contains no cloud-specific or infrastructure logic; all domain-specific intelligence — template rendering, format translation, policy evaluation, linting — lives inside plugins. The host orchestrates the pipeline and passes JSON payloads across the ABI boundary to the guest; the guest does the domain work and returns a JSON result.

A plugin runs behind an ahead-of-time-purity firewall. The host loads and executes the module through an embedded Wasm runtime under a capability-denied configuration: no network, no filesystem, no wall clock that varies across runs, no entropy, no environment, no stdio. A guest observes nothing that changes between builds, so a plugin cannot break the compiler's deterministic-output guarantee or reach for runtime state. Author plugins with this firewall in mind: a plugin transforms the JSON it is handed and returns a result; it never fetches, resolves, or queries anything live.

The sockets a plugin can target — the Step 2 mutation gate, the Step 4 validation gate, the FeatureRecipe pipeline, the out-of-band linter, and the provider-rendering socket — and their per-socket input/output shapes are documented in [`plugin-contract.md`](plugin-contract.md). The plugin-type taxonomy the runtime recognises is `provider` (renders IR nodes into provider-native artifacts), `linter` (inspects authored content and raises diagnostics), and `frp_step` (a feature-recipe-pipeline step that transforms IR within a pipeline).

You author the guest against the host through the three-language plugin development kit (PDK) — Go, Rust, or TypeScript. The PDK wraps the underlying Wasm toolchain with Aggrega-typed builders for the input and output shapes each socket carries.

## 2. The `describe()` self-report

Every plugin exports a `describe()` function that returns the plugin's self-report: the socket type(s) it implements, the ABI version it targets, the provider engines it claims compatibility with, the host functions it imports, and the per-export capability of each entry point it offers. `describe()` is the plugin's own account of what it is and what it does.

The self-report is the anchor of the trust model. The `Plugin` entity that carries the plugin into the catalog (Section 5) restates the same facts as authored claims, and the host cross-checks the entity's claims against the plugin's `describe()` output at two moments — at publish, before any bytes land in the registry, and at load, before the plugin runs. A mismatch halts loudly. The entity is the human-readable, catalog-visible surface; `describe()` is the machine-of-record the host verifies it against. Author both to agree; the cross-check exists precisely to catch the case where they drift.

## 3. Authoring exports and their capability claims

A plugin offers one or more **exports** — named entry points the host dispatches to (for example `render_node`, `lint_naming`, `step`). Each export carries a capability block: the author's claim of what that export does. An export's capability has four fields:

- **`name`** — the export's ABI name, the name the host dispatches to. Required.
- **`operates`** — the pipeline operation the export performs: `patch` (modify an existing rendered document) or `emit` (add a new document). This is a declared capability claim. The host cross-checks it against the plugin's `describe()` self-report at publish and at load, so the entity's authored claim and the plugin's own account must agree. It is a validated claim about the export, not a dispatch switch: at render time the operation a step actually performs is carried by the guest's returned result, not selected from this field. Absent carries no operation claim.
- **`scope`** — the document root the export operates on: `own` (the node's own rendered documents) or `host` (the documents of the component a component-scope FeatureRecipe is attached to). Before a pipeline step's plugin runs, the host reads the step's declared export scope and enforces that the provider rendering that scope's documents appears in the plugin's `compatibleProviders` (Section 5) — an `own`-scope export is checked against the provider rendering the node's own documents, a `host`-scope export against the host component's provider, and an empty scope defaults to `own` for this check. This is the provider-compatibility gate, run ahead of the step; the document a guest operation actually touches is named per-operation in the guest's returned result, not selected from this declared field. Absent defaults to `own`.
- **`selector`** — a free-form, human-readable description of what the export acts on (for example `workloads carrying a pod template`). Documentation for catalog readers and the `aggrega inspect` surface; the compiler does not interpret it.

Author exports in the order you want them read; entries preserve author order on the entity and in `inspect`. A plugin with no authored exports declares no export surface — valid for a plugin whose socket does not need a per-export capability claim.

## 4. Runtime limits and host functions

A plugin entity may carry an optional `runtime` block that constrains how the host loads and runs the plugin.

**Memory and time limits.** `maxMemoryPages` caps the plugin's linear memory in Wasm pages (64 KiB per page); `timeoutMs` caps per-call execution wall time in milliseconds. Both are optional-with-defaults: zero or absent applies the platform default cap. The loader caps every plugin at the platform default when the entity declares none, so a load is never unbounded and a call is never uncancellable. Raise a limit on the entity when an attachment genuinely needs more memory or more time than the default allows.

**Host functions.** `hostFunctions` records the host function names the plugin imports. It is a **machine-derived field — do not author it.** Publish reads the host functions directly from the `.wasm` import section and stamps the field into the entity for you; the value reflects the published binary, so a plugin gets exactly the host functions its binary actually imports, validated against a curated allowlist (an import outside the allowlist is rejected loudly). The stamp is a snapshot of the published binary, the same way the content-addressed `plugin:` reference is a snapshot of the published bytes: it reflects the binary at publish time and is re-derived and verified when the plugin is pulled. To see the host functions a local `.wasm` imports before publishing — the value publish will stamp — run `aggrega inspect --plugin <file.wasm>`.

There is no host-allowlist field for outbound network access. A plugin never reaches the network at build time — that is the ahead-of-time boundary — so no such field exists to author.

**Configuration.** `configKV` is a string-to-string map the runtime hands the plugin at start. Entries preserve author order so the emitted record is byte-identical across runs. Absent leaves the runtime's default empty configuration in effect.

## 5. The `Plugin` entity

A plugin enters the catalog as a `Plugin` entity — the authoring and metadata surface for the plugin. The entity declares what the plugin is and points at the `.wasm` artifact; the compiler is blind to the plugin's behaviour and routes the pinned reference, while the Wasm runtime executes the bytes.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Plugin
metadata:
  name: secret-providers/aws-secrets-manager
  version: 1.2.0
spec:
  plugin: "oci://hub.aggrega.ai/wasm/secret-providers/aws-secrets-manager@sha256:<64-hex-digest>"
  pluginType: frp_step
  abiVersion: v1alpha1
  compatibleProviders:
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

- **`spec.plugin`** — the canonical content-addressed reference to the `.wasm` artifact, in the form `oci://<repository>@sha256:<digest>`. The reference is the plugin's identity; the digest is what the closure pins and the build verifies. A tag-form reference authored elsewhere resolves to its `sha256` digest at pull and pins to this canonical digest form. Required.
- **`spec.pluginType`** — the socket type this plugin implements, drawn from `provider`, `linter`, `frp_step`. A plugin implements exactly one. Required.
- **`spec.abiVersion`** — the host/guest ABI version the plugin targets. `v1alpha1` is the accepted value; a future ABI revision adds an accepted value. Required.
- **`spec.compatibleProviders`** — the provider engines this plugin is tested-compatible with (provider names such as `helm` or `compose`). A plugin is generic across artifacts that share a provider's output shape, not across all providers, so this is an explicit, tested-compatibility claim. The list is render-enforced: when a pipeline step touches a scope, the provider rendering that scope's documents must appear here, or the build halts. An empty or absent list declares no compatibility claim, matches no provider, and halts any pipeline step that uses the plugin. Entries preserve author order.
- **`spec.signature`** — an optional descriptive pointer to the plugin's attached signature (Section 8). This block is documentation only: it records where the signature lives and how it was produced for catalog readers; it does not itself admit the plugin. The enforcing check is the per-registry trust policy applied at pull.
- **`spec.runtime`** — the optional execution-constraints block from Section 4. The author writes `maxMemoryPages`, `timeoutMs`, and `configKV`; `hostFunctions` is machine-derived and stamped by publish, not authored.
- **`spec.exports`** — the per-export capability claims from Section 3 (`name`, `operates`, `scope`, `selector`).

For the field-by-field reference, see the entity page [`../entities/plugin.md`](../entities/plugin.md).

## 6. Referencing a plugin

A pipeline step or a plugin socket references a plugin by its **`Plugin` entity URI** — the entity's identity, not the `.wasm` artifact directly. The entity is the layer that carries the digest pin, the capability claims, the runtime limits, and the signature; referencing the entity is how a consumer picks up all of it.

A bare `.wasm` path or a raw artifact reference left in a `plugin` field is rejected at load: no `Plugin` entity matches it, so plugin resolution fails loudly. The entity URI is mandatory — the indirection through the entity is the contract, not an optional convenience. A FeatureRecipe pipeline step names the entity in `pipeline[].plugin`; see [`../entities/featurerecipe.md`](../entities/featurerecipe.md) for the pipeline authoring surface.

When two or more plugins are coupled — they must agree on a shared hand-off contract, as in a Fetcher and Injector pair where one plugin's output is the other's input (the Two-Part Plugin Principle described in [`plugin-contract.md`](plugin-contract.md)) — author that contract once and have each plugin depend on the single definition rather than restating the JSON hand-off shape independently in each plugin. The shared shape is the JSON structure the plugins exchange, which can live in a single SchemaLibrary entry both plugins reference. A single source for the contract keeps coupled plugins in sync as it evolves; independent restatements drift, and the drift surfaces only when the two no longer agree at runtime. The recommendation is to share the contract, not the Wasm code — each plugin remains its own artifact.

## 7. The publish → pull → build lifecycle

A plugin moves from a `.wasm` file on disk to a build-consumable, verified artifact through three stages.

**Publish.** `aggrega push` publishes a `Plugin` entity together with its `.wasm` artifact as two ordered OCI artifacts. The `.wasm` lands first, addressed by its content digest; the entity lands second, referencing the `.wasm` by that digest in `spec.plugin`. The ordering plus the content-digest pin makes a partial push safe: a failed entity push leaves only an orphan `.wasm` addressed by digest, with no entity tag, so a retry is clean.

Before any bytes land, publish runs its checks. The `.wasm` is loaded and its `describe()` self-report is cross-checked against the entity's authored capability claims — a mismatch halts loudly, so a published entity never disagrees with the plugin it ships. The `.wasm` content digest is computed once and stamped into `spec.plugin`; if the on-disk `spec.plugin` already pins a digest, it must equal the computed one or the publish halts. The host functions the `.wasm` imports are derived from the binary and stamped into `spec.runtime.hostFunctions` (a divergent on-disk value is overwritten with a warning, since the field is machine-owned). The published entity carries the resolved, digest-pinned reference and the stamped host-function record.

**Pull.** `aggrega pull` resolves a Release's full dependency closure and writes a per-Release lockfile pinning every catalog entity and remote artifact to a version and content digest. A published `Plugin` resolves through this closure; its `.wasm` is fetched by the content-digest pin in `spec.plugin` and the bytes are verified against that digest. Pull also re-derives the host functions from the verified `.wasm` and checks them against the stamped `hostFunctions` record, halting if the two disagree — a defense-in-depth check over the digest pin that catches a binary whose stamp was not produced from its own imports. If the registry's trust policy requires signatures, the entity's signature is fetched and verified at this stage and recorded as a verified fact in the lockfile (Section 8). Verification happens at pull, never at build — the build stays ahead-of-time-pure.

**Build.** `aggrega build` consumes the pinned, verified plugin from the closure. The compiler routes the digest-pinned reference and the Wasm runtime executes the bytes; the load gate re-runs the `describe()` cross-check and the host-function and runtime-limit enforcement before the plugin runs.

## 8. Signing and trust

A `Plugin` entity is signed exactly as every other catalog entity: the entity manifest's digest is signed and attached as an OCI referrer. The `.wasm` artifact is not signed separately — the signed entity commits to the `.wasm` content digest through `spec.plugin`, so the entity signature transitively covers the artifact: tampering with the `.wasm` breaks the digest pin the signed entity asserts.

Signing is opt-in at publish; verification is enforced by the per-registry trust policy at pull. A registry configured to require signatures halts the pull when a required signature is missing, untrusted, or invalid. The `spec.signature` block on the entity is a documentation pointer to where the signature lives and how it was produced; it records facts for catalog readers and does not itself gate admission. The gate is the pull-time policy.

The commands and their flags are documented with the publishing and consume surfaces — see [`../cli/aggrega-sign.md`](../cli/aggrega-sign.md), [`../cli/aggrega-push.md`](../cli/aggrega-push.md), and [`../cli/aggrega-pull.md`](../cli/aggrega-pull.md). This guide does not restate the flag tables; those pages are the single home for the command surface.

## 9. Versioning the entity

A `Plugin` entity carries a strict Semantic Version in `metadata.version`. A published version is immutable: re-publishing a version that already exists in the registry is rejected at the publish gate.

When you change a plugin entity and re-publish, the publishing discipline classifies the change against the previously published version and requires the version bump to match. The classification is the version-bump rubric: a documentation- or comment-only change is `PATCH`; a strictly additive change (a new optional field, a new entry) is `MINOR`; a removal, a type narrowing, or a previously-optional field becoming required is `MAJOR`. Over-bumping is always allowed; under-bumping halts with a diagnostic naming the required bump. The first publication of an entity skips the bump check and surfaces a warning that no verification was performed. Run the check before publishing with `aggrega lint --pre-publish`; see [`../cli/aggrega-lint.md`](../cli/aggrega-lint.md) for the full rubric and the per-rule settings.

The monotonic-narrowing rule that applies to entities using `extends` does not apply to a `Plugin`: the entity has no `extends` surface, so there is no parent schema to narrow against. The version-bump rubric and immutability are the versioning discipline that governs a plugin entity.

## 10. Cross-references

- [`plugin-contract.md`](plugin-contract.md) — the socket points a plugin targets and the per-socket input/output shapes.
- [`../entities/plugin.md`](../entities/plugin.md) — the `Plugin` entity field-by-field reference.
- [`../entities/featurerecipe.md`](../entities/featurerecipe.md) — the FeatureRecipe `pipeline:` authoring surface that references a plugin by entity URI.
- [`../cli/aggrega-lint.md`](../cli/aggrega-lint.md) — the publishing-linter, the version-bump rubric, and immutability enforcement.
- [`../cli/aggrega-inspect.md`](../cli/aggrega-inspect.md) — inspecting a `Plugin` entity's capabilities, runtime limits, and signature.
- [`../cli/aggrega-push.md`](../cli/aggrega-push.md), [`../cli/aggrega-pull.md`](../cli/aggrega-pull.md), [`../cli/aggrega-sign.md`](../cli/aggrega-sign.md) — the publish, consume, and signing command surfaces.
