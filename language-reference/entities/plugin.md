# Plugin

A `Plugin` is a content-addressed WebAssembly plugin: an OCI-hosted `.wasm` artifact pinned by `sha256` digest, declaring the socket type(s) it implements, the ABI version it targets, an optional signature pointer, and an optional runtime block. The entity is the authoring and metadata surface for a plugin; the closure pins the artifact by digest and the per-registry trust policy verifies its signature at pull. The compiler is blind to the plugin's behaviour — it routes the pinned reference; the WebAssembly runtime executes the bytes.

This page covers the `Plugin` catalog authoring surface field by field. For the end-to-end author workflow — what a plugin is, the `describe()` self-report, the publish→pull→build lifecycle, signing, and versioning — see the [Wasm plugin developer guide](../wasm/plugin-developer-guide.md). For the socket points a plugin attaches to and their input/output shapes, see the [Wasm plugin contract](../wasm/plugin-contract.md).

## The Plugin's role

A `Plugin` ties a logical plugin identity to a concrete `.wasm` artifact and to the capability and runtime metadata the host needs to load and run it safely. A pipeline step or a plugin socket references the entity by its URI; the entity carries the digest pin, the declared capabilities, the runtime limits, and the signature. The indirection through the entity is mandatory — a bare `.wasm` or artifact reference left in a `plugin` field is rejected at load because no entity matches it.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Plugin
metadata:
  name: secret-providers/aws-secrets-manager
  version: 1.2.0
spec:
  plugin: "oci://hub.aggrega.ai/wasm/secret-providers/aws-secrets-manager@sha256:<64-hex-digest>"
  pluginTypes:
    - frp_step
  abiVersion: v1alpha1
  compatibleProviders:
    - helm
    - compose
  signature:
    type: sigstore-cosign
  runtime:
    maxMemoryPages: 256
    timeoutMs: 5000
    declaredHostFunctions:
      - log
  exports:
    - name: fetch
      operates: emit
      scope: own
      selector: external-secret resources for the bound credential
```

## `metadata`

Standard catalog metadata. `name` and `version` are required; `version` is a strict Semantic Version (e.g. `1.2.0`). The optional fields — `description`, `maintainers`, `license`, `repository`, `home`, `keywords`, `deprecated` — follow the same shape every catalog entity carries. A published version is immutable: re-publishing an existing version is rejected at the publish gate.

## `spec.plugin`

The canonical content-addressed reference to the `.wasm` artifact, in the form `oci://<repository>@sha256:<digest>`. The reference is the plugin's identity; the digest is what the closure pins and the build verifies against the fetched bytes. A tag-form reference (`oci://<repository>:<tag>`) authored elsewhere resolves to its `sha256` digest at pull and pins to this canonical digest form — the published entity's `plugin` field carries the resolved, digest-pinned reference. Required.

## `spec.pluginTypes`

The socket type(s) this plugin implements, as an ordered list that preserves author order. A plugin may implement more than one socket. The value set matches the plugin-type taxonomy the runtime recognises:

- `provider` — renders IR nodes into provider-native artifacts.
- `linter` — inspects authored content and raises diagnostics.
- `frp_step` — a feature-recipe-pipeline step that transforms IR within a pipeline.

Required, with at least one entry.

## `spec.abiVersion`

The host/guest ABI version the plugin targets. `v1alpha1` is the only accepted value; a future ABI revision adds an accepted value. Required.

## `spec.compatibleProviders`

The provider engines this plugin is tested-compatible with, as provider names such as `helm` or `compose`. A plugin is generic across artifacts that share a provider's output shape, not across all providers; the list is an explicit, tested-compatibility claim, and entries preserve author order.

The list is render-enforced. When a pipeline step touches a scope, the provider rendering that scope's documents must appear in this list, or the build halts. An empty or absent list declares no compatibility claim: it matches no provider, so the runtime halts any pipeline step that uses the plugin. Declare every provider whose output the plugin is tested against.

## `spec.signature`

An optional descriptive pointer to the plugin's attached signature. The block is documentation only — it records where the signature lives and how it was produced for catalog readers; it does not itself admit the plugin. The enforcing check is the per-registry trust policy applied at pull: a signature is fetched as an OCI referrer, verified against the registry's trusted identities or pinned key, and recorded as a verified fact in the lockfile. A registry that requires signatures halts the pull when a required signature is missing, untrusted, or invalid.

- `type` — the signature scheme. `sigstore-cosign` is the supported scheme. Required when the block is present.
- `signatureRef` — the OCI referrer reference of the attached signature bundle, for documentation and discovery. Absent when the signature is discovered by referrer enumeration at pull rather than pinned here.
- `publicKeyRef` — a pointer to the public key the signature was produced with, for a keyed signature. Absent indicates a keyless (OIDC-identity) signature, verified against the registry's trusted identities.

## `spec.runtime`

Optional execution constraints the host applies when loading and running the plugin. Outbound network access is not an authoring field: a plugin never reaches the network at build time — the ahead-of-time boundary — so there is no host-allowlist field here.

| Field | Effect |
| --- | --- |
| `maxMemoryPages` | Caps the plugin's linear memory in Wasm pages (64 KiB per page). Zero or absent applies the platform default cap, so a load is never unbounded; an attachment that needs more raises this value. |
| `timeoutMs` | Caps per-call execution wall time in milliseconds. Zero or absent applies the platform default cap, so a call is never uncancellable; an attachment that runs longer raises this value. |
| `declaredHostFunctions` | The host function names the plugin imports. The host validates every entry against the curated allowlist and registers only the declared functions, giving each plugin the least-privilege host surface it needs. A declared function outside the allowlist is rejected loudly at load. |
| `configKV` | Plugin-specific configuration the runtime hands the plugin at start, as string-to-string key/value pairs. Entries preserve author order so the emitted record is byte-identical across runs. Absent leaves the runtime's default empty configuration in effect. |

## `spec.exports`

The exports the plugin offers, each with its declared capability, as an ordered list that preserves author order. An export is one named entry point the host dispatches to (for example `render_node`, `lint_naming`, `step`); the per-export capability block is the authored claim of what that export does, which the host cross-checks against the plugin's `describe()` self-report at publish and at load. Absent declares no authored export surface.

| Field | Effect |
| --- | --- |
| `name` | The export's ABI name — the name the host dispatches to. Required for each entry. |
| `operates` | The pipeline operation the export performs: `patch` (modify an existing rendered document) or `emit` (add a new document). The host cross-checks the value against the plugin's self-report; it is a validated capability claim, not a dispatch switch — the operation a step performs is carried by the guest's returned result. Absent carries no operation claim. |
| `scope` | The document root the export operates on: `own` (the node's own rendered documents) or `host` (the documents of the component a component-scope FeatureRecipe is attached to). The host reads the declared scope ahead of the step to enforce provider compatibility against the provider rendering that scope. Absent defaults to `own`. |
| `selector` | A free-form, human-readable description of what the export acts on (for example `workloads carrying a pod template`). Documentation for catalog readers and the inspect surface; the compiler does not interpret it. |

## Inspecting a Plugin

`aggrega inspect <path-to-Plugin.yaml>` renders a `Plugin` file: its identity and socket types, its `compatibleProviders`, the per-export capability table in author order, the runtime constraints, and — at `--detail` — the signature pointer and the runtime config keys. A `Plugin` is inspectable by file path; the bare-name catalog lookup resolves Components only. See [`../cli/aggrega-inspect.md`](../cli/aggrega-inspect.md).

## Cross-references

- [Wasm plugin developer guide](../wasm/plugin-developer-guide.md) — the end-to-end author workflow: `describe()`, capability claims, runtime limits, lifecycle, signing, versioning.
- [Wasm plugin contract](../wasm/plugin-contract.md) — the socket points a plugin attaches to and their input/output shapes.
- [`entities/featurerecipe.md`](featurerecipe.md) — the FeatureRecipe `pipeline:` surface that references a plugin by entity URI.
- [`cli/aggrega-lint.md`](../cli/aggrega-lint.md) — the publishing-linter, the version-bump rubric, and immutability enforcement that govern publishing a `Plugin`.
