# Aggrega Release schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/release-v1alpha1.schema.json`

See the [release authoring reference](../../entities/release.md) for prose guidance on authoring release entities; this page documents the structural schema that reference describes.

**Top-level type:** `object`

## Properties

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `apiVersion` | const "aggrega.ai/v1alpha1" | yes | Constant: `"aggrega.ai/v1alpha1"` |
| `kind` | const "Release" | yes | Constant: `"Release"` |
| `metadata` | object | yes |  |
| `spec` | object | yes | The deployment binding and routing: the Aggregate and Manifest this release deploys (or an extends base), the environment-specific parameter fulfillment, and the boundaries that route components into deployment targets. |

_Additional properties are not permitted._

#### `release.metadata`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes |  |
| `environment` | string | yes |  |
| `version` | string | yes | Strict Semantic Versioning of the release (e.g., 1.0.0). |
| `description` | string | no | What this entity is and what it is for, written for someone deciding whether to use it. Open with a sentence naming the thing, then add what a reader needs in order to choose it and use it correctly — what it expects from a deployment, and anything surprising about how it behaves. A short paragraph is the usual length. |
| `maintainers` | object[] | no | List of maintainers who own this entity. |
| `license` | string | no | SPDX identifier for the license of the software this entity describes, such as MIT or AGPL-3.0. It records the terms of that software, not the terms of this file. |
| `repository` | string | no | The URL to the Git repository where the source files live. |
| `home` | string | no | The URL of this entity's home page, wiki, or documentation. |
| `keywords` | string[] | no | A list of descriptive keywords for UI discoverability. |

_Additional properties are not permitted._

##### `release.metadata.maintainers[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes |  |
| `email` | string | no |  |
| `url` | string | no |  |

_Additional properties are not permitted._

#### `release.spec`

The deployment binding and routing: the Aggregate and Manifest this release deploys (or an extends base), the environment-specific parameter fulfillment, and the boundaries that route components into deployment targets.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `aggregate` | string | no | Reference to the Aggregate (Developer Intent) this release deploys. A bare token resolves by identity — the referenced Aggregate's metadata.name, searched in the Release's own directory and then the catalog. A value beginning with './' or '../' is an explicit local file resolved relative to the Release (e.g. '../shared/app.yaml' to share one Aggregate across release variants in a subdirectory). |
| `manifest` | string | no | Reference to the Manifest resolving the abstract interfaces this release deploys against. A bare token resolves by identity — the referenced Manifest's metadata.name, searched in the Release's own directory. A value beginning with './' or '../' is an explicit local file resolved relative to the Release. A Manifest is deployment-side and is not catalog-indexed, so it resolves only from the Release directory or an explicit path. |
| `extends` | string | no | Enables base-layer inheritance for frictionless local Dev Loops vs Prod deployments. |
| `parameters` | object | no | Environment-specific variable fulfillment contract with two authoring modes via content-shape dispatch. Mode 1 (inline): a YAML map carrying structured nested parameter values directly. Mode 2 (file import): a YAML map of exactly one key, `$import: ./relative/path.yaml`, pointing at a single local file that supplies the parameter values. Single-source-only at this site — multi-file layering is the province of Release `extends:` chains (the parent Release supplies base parameters; the child extends + overrides). |
| `boundaries` | map of boundary | no | The root logical boxes into which the Aggregate's components are routed. Keys: one or more letters, digits, underscores or hyphens. A dot is not permitted. Pattern: `^[a-zA-Z0-9_-]+$`. |
| `components` | map of boundary_component | no | Top-level component instances carrying per-component operator infra, for a single-scope Release with no named boundaries. Mutually exclusive with `boundaries`: declare `components` for a flat Release or `boundaries` for multi-target routing, never both. When `components` is used, the compiler synthesizes a `default` boundary holding them and emits their artifacts to `dist/` flat. Keys: one or more letters, digits, underscores or hyphens. A dot is not permitted. Pattern: `^[a-zA-Z0-9_-]+$`. |

_Additional properties are not permitted._

## Definitions

### `boundary_component`

A component instance routed into a boundary, with optional physical sizing and feature attachments.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `description` | string | no | Optional documentation describing this component's deployment context in this boundary. |
| `subDirectory` | string | no | Component-level sub-path override appended to the parent boundary's directory. If omitted on both boundary and component, defaults to '{{ .capability }}'. Set to '.' or '' to disable sub-directory generation. |
| `annotations` | map of string or object or null | no | Component-specific Operator annotations that override boundary-level annotations for this component. Deep-merged over boundary annotations (component wins on key collision; structured values per-subkey-merge with structured parents). Values are strings, structured objects, or null. Used for per-component provider well-known annotation overrides (e.g., aggrega.ai/chart-name). The provider is responsible for validating consistency when grouping components (e.g., helm-chart provider rejects components with different aggrega.ai/namespace values in the same chart). Explicit null on a key inherited from the parent boundary removes the inherited binding from this component (annotation-driven Feature opt-out); sibling components retain the inherited binding. |
| `infra` | object | no | Physical sizing strictly local to this component (e.g., replicas, disk IOPS). |
| `features` | map of object | no | Features attached to this component via the Release. For features also declared in the Aggregate, only infra is provided (values come from the Aggregate). For Release-only features (Operator-injected), type is required. Keys are feature instance names and may carry the full feature type URI (dots and slashes permitted). The Release MUST NOT provide values for features — this is the Developer's domain. Keys: one or more letters, digits, underscores, dots, slashes or hyphens. Pattern: `^[a-zA-Z0-9_./-]+$`. |
| `uses` | release_uses_block | no | Operator edge surface. Within Architect-declared sockets the Release may wire a declared-but-unbound socket to an existing component (target) and/or supply per-edge infra. No values (the Release values: ban holds) and no compute creation; retargeting a developer-declared edge halts at build. |

_Additional properties are not permitted._

### `release_uses_block`

Release-authored per-edge uses surface, socket-keyed then alias-keyed (mirroring the Aggregate uses topology shape). Each connection may set target (to create an edge into a declared-but-unbound socket, pointing at an existing component) and/or infra (per-edge operator config, validated against the socket infraSchema by the conformance gate at resolution). values is forbidden (the Release values: ban); retargeting a developer-declared edge is a loud guardrail at build.

**Keys:** one or more letters, digits, underscores or hyphens. A dot is not permitted. Pattern: `^[a-zA-Z0-9_-]+$`.

Values are `map of object`.

_Any other key is not permitted._

### `aggregate_routing`

Routes a nested Aggregate sub-module's internal components into this boundary. Mirrors the boundary's component/aggregate structure for recursive composition.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `components` | map of boundary_component | no | Component instances within the nested aggregate to route into this boundary. Keys are the local name each component carries inside that sub-module — 'main-db' for the component a boundary's own `components` map addresses as 'data.main-db' — because that is the only name it has there. Keys: one or more letters, digits, underscores or hyphens. A dot is not permitted. Pattern: `^[a-zA-Z0-9_-]+$`. |
| `aggregates` | map of aggregate_routing | no | Further nested aggregates within this sub-aggregate (for deeply nested module composition). Keys: one or more letters, digits, underscores or hyphens. A dot is not permitted. Pattern: `^[a-zA-Z0-9_-]+$`. |

_Additional properties are not permitted._

### `boundary`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `description` | string | no | Optional documentation describing this boundary's purpose and physical target (e.g., 'Primary production EKS cluster in us-east-1, PCI-DSS compliant'). |
| `directory` | string | no | Physical output path for GitOps artifact generation. Supports Go template variables ({{ .capability }}, {{ .boundary_name }}, {{ .parameters.X }}). Combined with subDirectory as a path join to produce the final artifact path. |
| `subDirectory` | string | no | Boundary-level sub-path appended to directory. If omitted on both boundary and component, defaults to '{{ .capability }}' for CI/CD auto-partitioning. Set to '.' or '' to disable. |
| `syncWave` | integer | no | Optional per-boundary deployment wave (signed integer, default 0). Every component in this boundary inherits the boundary's wave into its node. Negative values are permitted (run before everything else); larger values run after lower ones. On K8s and Helm the wave is what orders the deployment: it becomes an `argocd.argoproj.io/sync-wave` annotation, and on a resource the chart already marks as a Helm hook it also becomes that hook's `helm.sh/hook-weight`. On compose the wave both is recorded as a service label and orders the services of the file it renders into, through `depends_on` between them — so it reaches every service in that one file and nothing outside it. On cloudformation the wave orders provisioning of the stack the boundary assembles into: every resource in a wave is declared to depend on the resources of the wave before it, which fixes the order they are created in and, in reverse, the order they are deleted in. That is creation and deletion order only — a stack template expresses no notion of a resource being ready, so nothing waits for one to become serviceable. On terraform the wave orders the module blocks of the root configuration the boundary assembles into: every module in a wave is declared to depend on the modules of the wave before it, which fixes the order the engine performs its actions in. That is action order only — a configuration expresses no notion of a resource being ready, so nothing waits for one to become serviceable — and the value is also recorded with the node's build provenance. The compiler carries the same value onto every node in the boundary as that node's `sync_wave`, where the per-target behaviour is described again from the node's side. Nested boundaries do not implicitly inherit — each declares its own wave. |
| `annotations` | map of string or object or null | no | Boundary-wide Operator annotations cascading down to the .context.annotations.release bucket. Values are strings, structured objects, or null. A structured value carries per-subkey configuration that deep-merges with structured parents (per-subkey, child wins) and flows through annotation-driven Feature expansion; only scalar values surface in the render context. Explicit null on a key inherited from a parent boundary removes the inherited binding from this boundary's effective annotation set (annotation-driven Feature opt-out), propagating to every component routed into this boundary unless a deeper override re-introduces the binding. |
| `features` | map of object | no | Boundary-wide features applied to all nested components (e.g., default security mesh). A feature's uses block projects to every component in the boundary, declaring a shared dependency once at the boundary rather than repeating it on each component. Keys are feature instance names and may carry the full feature type URI (dots and slashes permitted). Keys: one or more letters, digits, underscores, dots, slashes or hyphens. Pattern: `^[a-zA-Z0-9_./-]+$`. |
| `boundaries` | map of boundary | no | Nested logical boundaries (e.g., namespaces within a cluster). Keys: one or more letters, digits, underscores or hyphens. A dot is not permitted. Pattern: `^[a-zA-Z0-9_-]+$`. |
| `components` | map of boundary_component | no | Which components from the Aggregate are placed in this boundary. Keys are component instance names; a sub-aggregate's component is addressed by its qualified dotted path (e.g., 'data.main-db' — the aggregate instance name, a dot, the component name). Keys: one or more letters, digits, underscores, dots or hyphens. Pattern: `^[a-zA-Z0-9_.-]+$`. |
| `aggregates` | map of aggregate_routing | no | Routes nested Aggregate sub-module components into this boundary. Keys are aggregate instance names matching the Aggregate's spec.aggregates map. All aggregate instances must be placed in exactly one boundary if boundaries are defined. Keys: one or more letters, digits, underscores or hyphens. A dot is not permitted. Pattern: `^[a-zA-Z0-9_-]+$`. |

_Additional properties are not permitted._

### `uses_block`

The Structural Topology - Developer Owned. Declares logical network edges and dependencies.

**Keys:** one or more letters, digits, underscores or hyphens. A dot is not permitted. Pattern: `^[a-zA-Z0-9_-]+$`.

Values are `string[] or map of object`.

_Any other key is not permitted._

### `inject_block`

Agnostic injection routing. Maps local variables to target provides keys (uses[].inject) or to literal strings / template expressions (component.inject). Each delivery mechanism (env, file, arg, or custom) is authored as an array of {in, from?, value?} entries — explicit 'from' for provides references and 'value' for literals.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `env` | inject_delivery | no | A single delivery mechanism, authored as an array of entries. Each entry carries an 'in' (local identifier — env var name, file path, arg flag, or custom mechanism-specific key) plus exactly one of 'from' (a provides key to resolve) or 'value' (a literal string, optionally containing Go template expressions evaluated at self-inject resolution). 'from' resolves against the target's provides in uses[].inject context, or against the component's own provides in component.inject context. |
| `file` | inject_delivery | no | A single delivery mechanism, authored as an array of entries. Each entry carries an 'in' (local identifier — env var name, file path, arg flag, or custom mechanism-specific key) plus exactly one of 'from' (a provides key to resolve) or 'value' (a literal string, optionally containing Go template expressions evaluated at self-inject resolution). 'from' resolves against the target's provides in uses[].inject context, or against the component's own provides in component.inject context. |
| `arg` | inject_delivery | no | A single delivery mechanism, authored as an array of entries. Each entry carries an 'in' (local identifier — env var name, file path, arg flag, or custom mechanism-specific key) plus exactly one of 'from' (a provides key to resolve) or 'value' (a literal string, optionally containing Go template expressions evaluated at self-inject resolution). 'from' resolves against the target's provides in uses[].inject context, or against the component's own provides in component.inject context. |

### `inject_delivery`

A single delivery mechanism, authored as an array of entries. Each entry carries an 'in' (local identifier — env var name, file path, arg flag, or custom mechanism-specific key) plus exactly one of 'from' (a provides key to resolve) or 'value' (a literal string, optionally containing Go template expressions evaluated at self-inject resolution). 'from' resolves against the target's provides in uses[].inject context, or against the component's own provides in component.inject context.

**Type:** `any[]`
