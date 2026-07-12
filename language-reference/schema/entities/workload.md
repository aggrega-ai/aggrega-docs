# Aggrega Workload schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/workload-v1alpha1.schema.json`

Platform-owned abstract workload specification. A Recipe using synthesized mode declares exactly one Workload via the workload: keyword (inline block scalar or workload: { $import: <path> } per the unified file-import vocabulary). The target provider Engine translates the Workload into provider-native manifests (K8s Deployment/StatefulSet/Services/PVCs for helm; compose services + volumes + networks for compose; etc.). The Workload kind is NOT a catalog entity — it lives in the aggrega-cli binary (embedded JSON Schema at pkg/schemas/jsonschema/workload.json) alongside the canonical JSON schema published here.

See the [workload authoring reference](../../../entities/workload/) for prose guidance on authoring workload entities; this page documents the structural schema that reference describes.

**Top-level type:** `object`

## Properties

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `apiVersion` | const "aggrega.ai/v1alpha1" | yes | Constant: `"aggrega.ai/v1alpha1"` |
| `kind` | const "Workload" | yes | Constant: `"Workload"` |
| `metadata` | object | no |  |
| `form` | string (enum) | no | Abstract controller-shape intent for the workload. Chooses the kind of runtime lifecycle the workload has, independent of any target platform: stateless (interchangeable long-running replicas), stateful (replicas with stable per-replica identity and per-replica storage), daemon (one instance per eligible host), scheduled (recurring, time-triggered runs), task (a single run to completion). Empty is treated as stateless. Each target Engine maps the form to its own native shape; the form carries no platform-native resource kinds itself. A persistentTemplate volume is a companion of stateful and is only valid on a stateful workload. Allowed values: `"stateless"`, `"stateful"`, `"daemon"`, `"scheduled"`, `"task"` Default: `"stateless"` |
| `schedule` | string | no | Cron schedule for form: scheduled — a standard 5-field crontab expression (for example '0 0 * * *') or one of the macros @hourly, @daily, @weekly, @monthly, @yearly. Required when form is scheduled and only meaningful then; the target Engine pipes it verbatim into the scheduled resource's schedule field. |
| `replicas` | integer | no | Number of replicas. Default 1. Compose ignores values > 1 unless the target compose spec supports scaling. Default: `1` |
| `initContainers` | container[] | no | Ordered list of containers that run to completion before the main containers start. |
| `containers` | map of container | yes | Ordered map of container name → container spec. At least one entry required. YAML author order is preserved by the Go parser. |
| `volumes` | map of volume | no | Ordered map of volume name → volume spec. Each volume spec declares exactly one of: ephemeral, configmap, secret, persistent, persistentTemplate. |
| `services` | map of service | no | Ordered map of service name → service spec. Each becomes a separate K8s Service (helm) or port-publishing rule on the compose service (compose). Service names are suffixed by aggrega instance_id for K8s resource-name uniqueness. |
| `scheduling` | object | no | K8s-native scheduling constraints. Translated directly for helm; ignored (with warning) for compose except where compose has analogs. |
| `podSecurityContext` | object | no |  |
| `serviceAccount` | string | no | Name of the ServiceAccount this workload runs under. Actual RBAC (ServiceAccount/Role/RoleBinding resources) should be emitted via Features or artifacts, not via this field. |

_Additional properties are not permitted._

#### `workload.metadata`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `labels` | map of string | no | Author-declared labels. Merged with aggrega.ai/* provenance labels at emission (author values preserved; aggrega keys overwrite on collision). |
| `annotations` | map of string | no | Author-declared annotations on the workload. Translated to pod template annotations for helm, compose labels for compose. |

_Additional properties are not permitted._

#### `workload.scheduling`

K8s-native scheduling constraints. Translated directly for helm; ignored (with warning) for compose except where compose has analogs.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `nodeSelector` | map of string | no |  |
| `affinity` | object | no |  |
| `tolerations` | object[] | no |  |
| `topologySpreadConstraints` | object[] | no |  |

_Additional properties are not permitted._

#### `workload.podSecurityContext`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `runAsUser` | integer | no |  |
| `runAsGroup` | integer | no |  |
| `fsGroup` | integer | no |  |
| `supplementalGroups` | integer[] | no |  |

_Additional properties are not permitted._

## Definitions

### `container`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `image` | string | yes | Container image reference (e.g., 'nginx:1.27-alpine', 'ghcr.io/example/app:v1.2.3'). |
| `command` | string[] | no | Override the image's entrypoint. K8s: .command. Compose: entrypoint. |
| `args` | string[] | no | Arguments passed to command (or image entrypoint if command is absent). K8s: .args. Compose: command. |
| `variables` | map of string | no | Environment variables as string key-value pairs. K8s: spec.template.spec.containers[].env[]. Compose: services.<name>.environment. |
| `secrets` | map of containerSecret | no | Ordered map of env-or-file name → { from, as, path? }. Each entry references a slot declared in the Component's secretsSchema. The 'as' field selects the delivery mechanism, which must be allowlisted in the slot's inject: array. Blackbox slots (inject: []) MAY NOT appear here. |
| `ports` | map of integer | no | Named container ports. Port names referenced by services.*.ports and by probe http intent (port resolution). K8s: containerPort. Compose: expose/ports. |
| `resources` | object | no |  |
| `health` | object | no | Probe intents (http/tcp/exec). Translated to K8s httpGet/tcpSocket/exec for helm; CMD-SHELL healthchecks for compose (degraded — warning emitted). |
| `volumeMounts` | object[] | no |  |
| `restartPolicy` | string (enum) | no | Allowed values: `"Always"`, `"OnFailure"`, `"Never"` |
| `lifecycle` | object | no |  |
| `securityContext` | object | no |  |

_Additional properties are not permitted._

#### `container.resources`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `requests` | resourceList | no |  |
| `limits` | resourceList | no |  |

_Additional properties are not permitted._

#### `container.health`

Probe intents (http/tcp/exec). Translated to K8s httpGet/tcpSocket/exec for helm; CMD-SHELL healthchecks for compose (degraded — warning emitted).

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `ready` | probe | no |  |
| `live` | probe | no |  |
| `startup` | probe | no |  |

_Additional properties are not permitted._

#### `container.volumeMounts[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | Must match a key in top-level volumes: map. |
| `path` | string | yes | Mount point inside the container. |
| `readonly` | boolean | no | Default: `false` |

_Additional properties are not permitted._

#### `container.lifecycle`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `postStart` | lifecycleHook | no |  |
| `preStop` | lifecycleHook | no |  |

_Additional properties are not permitted._

#### `container.securityContext`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `runAsUser` | integer | no |  |
| `runAsGroup` | integer | no |  |
| `runAsNonRoot` | boolean | no |  |
| `readOnlyRootFilesystem` | boolean | no |  |
| `allowPrivilegeEscalation` | boolean | no |  |
| `capabilities` | object | no |  |

_Additional properties are not permitted._

##### `container.securityContext.capabilities`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `add` | string[] | no |  |
| `drop` | string[] | no |  |

_Additional properties are not permitted._

### `containerSecret`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `from` | string | yes | Name of a slot declared in the Component's secretsSchema. |
| `as` | string (enum) | yes | Delivery mechanism. Must be allowlisted in the slot's inject: array. Allowed values: `"env"`, `"file"` |
| `path` | string | no | File path inside the container (required when as: file). |

_Additional properties are not permitted._

### `resourceList`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `cpu` | string | no | K8s quantity (e.g., '100m', '0.5', '2'). Compose translates to cpus fractional. |
| `memory` | string | no | K8s quantity (e.g., '128Mi', '1Gi'). Compose translates to mem_limit bytes. |

_Additional properties are not permitted._

### `probe`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `http` | string | no | HTTP GET probe. Path is probed against the first container port (alphabetical by name) unless explicit port is supplied via namespaced form (deferred — single-string form is the current contract). |
| `tcp` | integer | no | TCP socket probe on the given container port number. |
| `exec` | string[] | no | Exec probe — the command to run inside the container. |
| `timeoutSeconds` | integer | no |  |
| `initialDelaySeconds` | integer | no |  |
| `periodSeconds` | integer | no |  |
| `failureThreshold` | integer | no |  |
| `successThreshold` | integer | no |  |

_Additional properties are not permitted._

### `lifecycleHook`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `exec` | string[] | no |  |
| `httpGet` | object | no | K8s-native httpGet shape (path, port, scheme, host, httpHeaders). Passed through to helm; compose translates to HEALTHCHECK-equivalent where possible. |

_Additional properties are not permitted._

### `volume`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `ephemeral` | object | no |  |
| `configmap` | object | no |  |
| `secret` | object | no |  |
| `persistent` | object | no |  |
| `persistentTemplate` | object | no | Per-replica claim template. Requires form: stateful, because only the stateful shape gives each replica the stable identity a per-replica claim needs. On Kubernetes it becomes StatefulSet.volumeClaimTemplates; compose degrades to a single named volume with a warning comment. |

_Additional properties are not permitted._

#### `volume.ephemeral`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `sizeLimit` | string | no | K8s quantity (e.g., '1Gi'). K8s: emptyDir.sizeLimit. Compose: tmpfs (size approximation; warning emitted). |

_Additional properties are not permitted._

#### `volume.configmap`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `source` | string | yes | Name of the ConfigMap (must be emitted by this Recipe via artifacts:, or by an attached Feature — cross-Recipe refs are forbidden per self-containment §4.4). |
| `items` | object[] | no | Optional key-to-path selection. |

_Additional properties are not permitted._

#### `volume.secret`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `source` | string | yes |  |
| `items` | object[] | no |  |

_Additional properties are not permitted._

#### `volume.persistent`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `size` | string | yes | K8s quantity (e.g., '10Gi'). |
| `class` | string | no | StorageClassName. Optional. |

_Additional properties are not permitted._

#### `volume.persistentTemplate`

Per-replica claim template. Requires form: stateful, because only the stateful shape gives each replica the stable identity a per-replica claim needs. On Kubernetes it becomes StatefulSet.volumeClaimTemplates; compose degrades to a single named volume with a warning comment.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `size` | string | yes |  |
| `class` | string | no |  |

_Additional properties are not permitted._

### `service`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | string (enum) | yes | Service type. Headless → K8s Service with clusterIP: None; compose treats ClusterIP as internal-only and LoadBalancer/NodePort as port-publishing. Allowed values: `"ClusterIP"`, `"NodePort"`, `"LoadBalancer"`, `"Headless"` |
| `ports` | map of integer | yes | Map of service port name → container port number. Port names must match keys in containers.<any>.ports. |

_Additional properties are not permitted._
