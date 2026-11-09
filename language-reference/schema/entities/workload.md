# Aggrega Workload schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/workload-v1beta1.schema.json`

Platform-owned abstract workload specification. A Recipe using synthesized mode declares exactly one Workload via the workload: keyword (inline block scalar or workload: { $import: <path> } per the unified file-import vocabulary). The target provider translates the Workload into provider-native manifests (K8s Deployment/StatefulSet/Services/PVCs for helm; compose services + volumes + networks for compose; etc.). A Workload carries no metadata of its own — no name, no labels, no annotations. Identity and labelling come from the component instance that declares it: the target provider derives each rendered resource's name from that instance and stamps the resource with the aggrega.ai/* provenance keys for that node. The Workload kind is NOT a catalog entity — this published file is the canonical Workload JSON Schema, and the compiler validates a Workload against it.

See the [Workload authoring reference](../../entities/workload.md) for prose guidance on authoring Workload entities; this page documents the structural schema that reference describes.

**Top-level type:** `object`

## Properties

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `apiVersion` | const "aggrega.ai/v1beta1" | yes | Constant: `"aggrega.ai/v1beta1"` |
| `kind` | const "Workload" | yes | Constant: `"Workload"` |
| `form` | string (enum) | no | Abstract controller-shape intent for the workload. Chooses the kind of runtime lifecycle the workload has, independent of any target platform: stateless (interchangeable long-running replicas), stateful (replicas with stable per-replica identity and per-replica storage), daemon (one instance per eligible host), scheduled (recurring, time-triggered runs), task (a single run to completion), reference (an external endpoint with no compute — no controller; helm emits an ExternalName Service, compose carries the endpoint through the injection contract). Empty is treated as stateless. Each target provider maps the form to its own native shape; the form carries no platform-native resource kinds itself. A persistentTemplate volume is a companion of stateful and is only valid on a stateful workload. A reference workload declares endpoint (and optionally port) and no containers, and carries no credential field of its own, because the environment-variable name belongs to the consumer rather than to the endpoint. A consumer that needs a credential for the endpoint declares the slot on its own Component's featuresSchema and fills it from its container's attachments block, where that slot's inject list permits the delivery. Allowed values: `"stateless"`, `"stateful"`, `"daemon"`, `"scheduled"`, `"task"`, `"reference"` Default: `"stateless"` |
| `endpoint` | string | no | External endpoint for form: reference — a host or URL. The compiler pipes it through as a deterministic pointer string; it is never resolved at compile time (AOT). Required when form is reference and only meaningful then. helm emits it as an ExternalName Service's externalName (the host portion); compose carries it to consumers through the recipe's provides. |
| `port` | integer | no | Optional port for the reference endpoint (form: reference). helm emits it as a port on the ExternalName Service. Minimum: `1`. Maximum: `65535`. |
| `schedule` | string | no | Cron schedule for form: scheduled — a standard 5-field crontab expression (for example '0 0 * * *') or one of the macros @hourly, @daily, @weekly, @monthly, @yearly. Required when form is scheduled and only meaningful then; the target provider pipes it verbatim into the scheduled resource's schedule field. |
| `suspend` | boolean | no | Holds the recurring schedule of a form: scheduled workload. When true, the scheduled resource is rendered with its schedule in place, but no run starts from that schedule until it is resumed; a run can still be created from the resource by hand — on Kubernetes, kubectl create job <name> --from=cronjob/<cronjob>. suspend: false renders exactly as an absent suspend does. Only meaningful with form: scheduled. helm emits it as the CronJob's spec.suspend. compose has no scheduled shape and halts on a form: scheduled workload whether or not it is suspended. Default: `false` |
| `replicas` | integer | no | Number of replicas. Default 1. On a compose target the value reaches no part of the output, and a warning reports it whenever it is authored — including an explicit `1`. Minimum: `0`. Default: `1` |
| `initContainers` | container[] | no | Ordered list of containers that run to completion before the main containers start. |
| `containers` | map of container | no | Ordered map of container name → container spec. At least one entry required. Author order is preserved. At least 1 entry. |
| `volumes` | map of volume | no | Ordered map of volume name → volume spec. Each volume spec declares exactly one of: ephemeral, configmap, secret, persistent, persistentTemplate. |
| `services` | map of service | no | Ordered map of service name → service spec. On helm each entry becomes a separate K8s Service, and an entry whose type is Loopback halts the build. On compose there is no separate service primitive, so entries do not map one to one: an entry whose type is NodePort or LoadBalancer publishes its ports on every host interface of the workload's own compose service, an entry whose type is Loopback publishes its ports there on the host's loopback address only, an entry whose type is ClusterIP or Headless publishes nothing, and every published port is collected into that one service's port list with the host port matching the container port. On helm each Service is named `<name>-<key>`: the name the workload's own Deployment (or other controller) carries, then a hyphen and the entry's key, so a Workload declaring `services.http` whose Deployment is named `api-server` renders a Service named `api-server-http`. On compose a key names nothing in the output. |
| `scheduling` | object | no | K8s-native scheduling constraints. Translated directly for helm. On a compose target these constraints reach no part of the output, and a warning reports the block when it is authored. |
| `podSecurityContext` | object | no |  |
| `serviceAccount` | string | no | Name of the ServiceAccount this workload runs under. Actual RBAC (ServiceAccount/Role/RoleBinding resources) should be emitted via Features or artifacts, not via this field. |
| `imagePullSecrets` | string[] | no | Names of image-pull Secrets for pulling images from private registries. helm emits pod.imagePullSecrets. compose has no in-file analog — registry authentication is configured out-of-band via docker login — and omits it. |
| `priorityClassName` | string | no | Name of the PriorityClass governing this workload's scheduling priority. helm emits pod.priorityClassName. compose has no single-host scheduling-priority analog and omits it. |
| `runtimeClassName` | string | no | Name of the RuntimeClass selecting the container runtime this workload runs under (for example a GPU-enabled runtime such as 'nvidia'). The compiler pipes the name through verbatim; the cluster resolves it to a configured RuntimeClass at schedule time. helm emits pod.runtimeClassName. compose has no runtime-class analog and omits it. Compute-only: not permitted on a reference workload. |
| `terminationGracePeriodSeconds` | integer | no | Seconds between SIGTERM and SIGKILL on shutdown. helm emits pod.terminationGracePeriodSeconds; compose emits stop_grace_period. Minimum: `0`. |
| `dnsPolicy` | string (enum) | no | Pod DNS policy. helm emits pod.dnsPolicy. compose has no DNS-policy analog and omits it (compose maps dnsConfig nameservers/searches directly instead). Allowed values: `"Default"`, `"ClusterFirst"`, `"ClusterFirstWithHostNet"`, `"None"` |
| `dnsConfig` | object | no | Custom pod DNS configuration. helm emits pod.dnsConfig. compose maps nameservers to dns and searches to dns_search; options have no compose analog and are omitted there. |
| `hostAliases` | object[] | no | Static hostname-to-IP mappings injected into the pod's hosts file. helm emits pod.hostAliases; compose emits extra_hosts (one hostname:ip entry per hostname). |
| `hostNetwork` | boolean | no | Run the workload in the host node's own network namespace instead of an isolated one. The ports the workload opens are then reachable on the node's own addresses, and the workload sees the node's network interfaces. This chooses a network namespace and nothing else: it declares no ports, and every port the workload opens is still declared under containers.<name>.ports. helm emits pod.hostNetwork. compose emits network_mode: host on the workload's own service; a compose service in that mode is not attached to the boundary network, so its peers reach it on the node's addresses rather than by service name, and each init container's service joins the boundary network in its own right. Compute-only: not permitted on a reference workload. |

_Additional properties are not permitted._

#### `workload.scheduling`

K8s-native scheduling constraints. Translated directly for helm. On a compose target these constraints reach no part of the output, and a warning reports the block when it is authored.

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

#### `workload.dnsConfig`

Custom pod DNS configuration. helm emits pod.dnsConfig. compose maps nameservers to dns and searches to dns_search; options have no compose analog and are omitted there.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `nameservers` | string[] | no |  |
| `searches` | string[] | no |  |
| `options` | object[] | no |  |

_Additional properties are not permitted._

#### `workload.hostAliases[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `ip` | string | yes |  |
| `hostnames` | string[] | yes |  |

_Additional properties are not permitted._

## Definitions

### `container`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | no | Optional container name. For a positional initContainers entry it sets the emitted container name, falling back to a generated init-<index> name (the entry's position in the list) when omitted. For a containers map entry the map key is the container name and this field is ignored. |
| `image` | string | yes | Container image reference (e.g., 'nginx:1.27-alpine', 'ghcr.io/example/app:v1.2.3'). |
| `imagePullPolicy` | string (enum) | no | Image pull policy. helm emits it as container.imagePullPolicy. compose maps it to the service pull_policy (Always to always, Never to never, IfNotPresent to if_not_present). Allowed values: `"Always"`, `"Never"`, `"IfNotPresent"` |
| `command` | string[] | no | Override the image's entrypoint. K8s: .command. Compose: entrypoint. |
| `args` | string[] | no | Arguments passed to command (or image entrypoint if command is absent). K8s: .args. Compose: command. |
| `variables` | map of string | no | Environment variables as string key-value pairs. K8s: spec.template.spec.containers[].env[]. Compose: services.<name>.environment. |
| `attachments` | map of containerAttachment | no | Ordered map of env-or-file name → { from, as, key?, path?, connection? }. Each entry references a slot declared in the Component's featuresSchema — or, when the entry names a connection, a slot that connection's socket declares — and delivers what the attachment filling that slot published. The 'as' field selects the delivery mechanism, which must be allowlisted in the slot's inject: array. Blackbox slots (inject: []) MAY NOT appear here. |
| `envFrom` | object[] | no | Bulk environment imported from a ConfigMap or Secret source. helm emits container.envFrom (configMapRef/secretRef). compose has no env-from-object primitive — a source reference is not a host file, so an env_file reinterpretation would silently change meaning; a workload declaring envFrom halts loudly on a compose target. |
| `ports` | map of integer or object | no | Named container ports. A port is authored either as the bare port number (`web: 8080`) or as an object carrying the number together with the transport protocol the port carries (`dns: { port: 53, protocol: UDP }`); where no protocol is declared the two forms mean the same thing. The allowed protocol values are `TCP`, `UDP` and `SCTP`, and omitting the key leaves the target's own default in force. Port names are referenced by `services.*.ports` and by an http probe's port resolution, and a service port takes its transport from the container port its name resolves to, so the transport is declared once. K8s: containerPort, carrying protocol only where one is declared. Compose: a container port reaches the output only where a service spec publishes it; the container port itself has no separate compose field, and a published port carries a declared transport as the `/protocol` suffix on the published entry — a transport compose cannot spell halts the build rather than publishing a port that would carry a different one. |
| `resources` | object | no |  |
| `health` | object | no | The container's health probes — ready, live and startup — each declared as http, tcp or exec. Translated to K8s httpGet/tcpSocket/exec for helm. For compose, a service carries a single healthcheck: http and tcp become CMD-SHELL tests, exec becomes a CMD test, and where more than one probe is declared only one is kept — a warning names the probe translated and the ones dropped. |
| `volumeMounts` | object[] | no |  |
| `restartPolicy` | string (enum) | no | Allowed values: `"Always"`, `"OnFailure"`, `"Never"` |
| `lifecycle` | object | no | Container lifecycle hooks. Translated to K8s container.lifecycle (postStart/preStop) for helm. compose has no lifecycle-hook primitive; a workload declaring lifecycle halts loudly on a compose target rather than silently dropping the hook. |
| `securityContext` | object | no |  |

_Additional properties are not permitted._

#### `container.envFrom[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `configMap` | string | no | Name of a ConfigMap source emitted by this Recipe's artifacts input or an attached Feature. |
| `secret` | string | no | Name of a featuresSchema slot — the Component's own, or, when connection is set, a slot that connection's socket declares; the imported Secret's name is resolved from the slot's provides. |
| `connection` | string | no | Alias of a connection the component draws — the name it is written under in the component's uses block, on the Aggregate or the Release. When set, secret names a slot the socket that connection is wired through declares, and the imported Secret is the one the attachment that connection carries in that slot published, so a component reaching several targets imports each one's own Secret. Meaningful only beside secret. A connection the component does not draw, or a slot its socket does not declare, is refused naming both. |
| `prefix` | string | no | Optional prefix prepended to every imported environment variable name. |

_Additional properties are not permitted._

#### `container.resources`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `requests` | resourceList | no |  |
| `limits` | resourceList | no |  |

_Additional properties are not permitted._

#### `container.health`

The container's health probes — ready, live and startup — each declared as http, tcp or exec. Translated to K8s httpGet/tcpSocket/exec for helm. For compose, a service carries a single healthcheck: http and tcp become CMD-SHELL tests, exec becomes a CMD test, and where more than one probe is declared only one is kept — a warning names the probe translated and the ones dropped.

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
| `subPath` | string | no | Mounts a single file or subdirectory from the volume at path, without masking other files in the target directory. |
| `readonly` | boolean | no | Default: `false` |

_Additional properties are not permitted._

#### `container.lifecycle`

Container lifecycle hooks. Translated to K8s container.lifecycle (postStart/preStop) for helm. compose has no lifecycle-hook primitive; a workload declaring lifecycle halts loudly on a compose target rather than silently dropping the hook.

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

### `containerAttachment`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `from` | string | yes | Name of a slot declared in the Component's featuresSchema — or, when connection is set, of a slot the socket that connection is wired through declares. |
| `connection` | string | no | Alias of a connection the component draws — the name it is written under in the component's uses block, on the Aggregate or the Release. When set, from names a slot the socket that connection is wired through declares (usesSchema.<socket>.featuresSchema), and the entry delivers what the attachment that connection carries in that slot published, so a component reaching several targets presents each its own credential. The slot's inject: allowlist governs as, exactly as for a slot the Component declares. A connection the component does not draw, or a slot its socket does not declare, is refused naming both. |
| `as` | string (enum) | yes | Delivery mechanism. Must be allowlisted in the slot's inject: array. Allowed values: `"env"`, `"file"` |
| `key` | string | no | For as: env, the specific data key of the referenced slot's secret this entry reads. Set it when the slot's secret carries several data keys, so this entry selects one of them by name; two entries may reference the same slot with different keys to read several keys from one secret. When omitted, the entry reads the slot's single published key. Ignored for as: file, which mounts the whole secret. |
| `path` | string | no | File path inside the container (required when as: file). |

_Additional properties are not permitted._

### `resourceList`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `cpu` | string | no | CPU quantity (e.g., '100m', '0.5', '2'). helm emits it verbatim under resources.{requests,limits}.cpu. compose maps it to deploy.resources.{reservations,limits}.cpus as fractional cores — a millicpu quantity is converted (500m becomes 0.5); a plain core quantity passes through. A quantity compose cannot convert halts loudly rather than emitting a wrong value. |
| `memory` | string | no | Memory quantity (e.g., '128Mi', '1Gi'). helm emits it verbatim under resources.{requests,limits}.memory. compose maps it to deploy.resources.{reservations,limits}.memory as an exact byte count. A quantity that comes to a whole number of bytes is converted exactly (1.5Gi becomes 1610612736); one that does not, or that is not a quantity, halts loudly rather than rounding. |

**Additional keys:** An extended (vendor/domain-scoped) resource quantity, keyed by a fully-qualified '<domain>/<name>' name (for example 'nvidia.com/gpu': '1', 'amd.com/gpu': '2'). The domain segment carries at least one dot, which distinguishes an extended key from the bare cpu/memory quantities. The compiler pipes the quantity through verbatim; the cluster's device plugin resolves and allocates it at schedule time. helm emits it under resources.{requests,limits}.<key>. compose reserves an 'nvidia.com/gpu' count as an NVIDIA device reservation on the container's service — the limit's count where a limit is written, the request's otherwise, and no reservation for a count of 0 — and halts on a count that is not a whole number of devices, or on a request and a limit asking for different counts. compose has no analog for any other extended key and omits it, warning once per distinct extended key and naming that key, so the drop is reported rather than silent. Pattern: `^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)+/[A-Za-z0-9]([-A-Za-z0-9_.]*[A-Za-z0-9])?$`.

_Any other property is not permitted._

### `probe`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `http` | string | no | HTTP GET probe: the path is probed against the container port whose name sorts first alphabetically. |
| `tcp` | integer | no | TCP socket probe on the given container port number. Minimum: `1`. Maximum: `65535`. |
| `exec` | string[] | no | Exec probe — the command to run inside the container. At least 1 entry. |
| `timeoutSeconds` | integer | no | Minimum: `1`. |
| `initialDelaySeconds` | integer | no | Minimum: `0`. |
| `periodSeconds` | integer | no | Minimum: `1`. |
| `failureThreshold` | integer | no | Minimum: `1`. |
| `successThreshold` | integer | no | Minimum: `1`. |

_Additional properties are not permitted._

### `lifecycleHook`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `exec` | string[] | no | At least 1 entry. |
| `httpGet` | object | no | The K8s-native httpGet shape (path, port, scheme, host, httpHeaders). Passed through to helm. On a compose target a workload declaring a lifecycle hook halts, because compose has no lifecycle-hook primitive — the hook is never silently dropped. |

_Additional properties are not permitted._

### `volume`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `ephemeral` | object | no |  |
| `configmap` | object | no |  |
| `secret` | object | no |  |
| `persistent` | object | no |  |
| `persistentTemplate` | object | no | Per-replica claim template. Requires form: stateful, because only the stateful shape gives each replica the stable identity a per-replica claim needs. On Kubernetes it becomes StatefulSet.volumeClaimTemplates. On a compose target it degrades to a single named volume shared by every replica, and a warning reports the degradation. |

_Additional properties are not permitted._

#### `volume.ephemeral`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `sizeLimit` | string | no | K8s quantity (e.g., '1Gi'). K8s: emptyDir.sizeLimit. Compose: the volume becomes a tmpfs entry that carries no size, so this value reaches no part of the output — a warning reports it when authored. |

_Additional properties are not permitted._

#### `volume.configmap`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `source` | string | yes | Name of the ConfigMap, emitted by this Recipe via artifacts: or by an attached Feature; a ConfigMap another Recipe emits is not referenced here. |
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
| `accessModes` | string (enum)[] | no | PVC access modes. helm emits spec.accessModes, defaulting to [ReadWriteOnce] when omitted. compose volumes have no access-mode concept and omit it. Allowed values for each entry: `"ReadWriteOnce"`, `"ReadOnlyMany"`, `"ReadWriteMany"`, `"ReadWriteOncePod"`. |

_Additional properties are not permitted._

#### `volume.persistentTemplate`

Per-replica claim template. Requires form: stateful, because only the stateful shape gives each replica the stable identity a per-replica claim needs. On Kubernetes it becomes StatefulSet.volumeClaimTemplates. On a compose target it degrades to a single named volume shared by every replica, and a warning reports the degradation.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `size` | string | yes |  |
| `class` | string | no |  |
| `accessModes` | string (enum)[] | no | PVC access modes for the per-replica claim template. helm emits spec.accessModes, defaulting to [ReadWriteOnce] when omitted. compose has no access-mode concept and omits it. Allowed values for each entry: `"ReadWriteOnce"`, `"ReadOnlyMany"`, `"ReadWriteMany"`, `"ReadWriteOncePod"`. |

_Additional properties are not permitted._

### `service`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | string (enum) | yes | Service type: how far the entry's ports reach. ClusterIP keeps them on the target's own network, reachable from the workload's peers; Headless does too, and on helm renders a K8s Service with clusterIP: None; NodePort and LoadBalancer publish them beyond that network; Loopback publishes them on the host's own loopback address only, reachable from the machine the workload runs on and from nowhere else. helm renders ClusterIP, NodePort and LoadBalancer as the K8s Service type of the same name, and refuses a Loopback entry by name, because a K8s Service has no type that binds to a host's loopback address. compose publishes nothing for ClusterIP and Headless, publishes NodePort and LoadBalancer ports on every host interface as host:container, and publishes Loopback ports on the IPv4 loopback address as 127.0.0.1:host:container; a port that a NodePort or LoadBalancer entry also publishes is published on every interface. Allowed values: `"ClusterIP"`, `"NodePort"`, `"LoadBalancer"`, `"Headless"`, `"Loopback"` |
| `ports` | map of integer | yes | Map of service port name → container port number. Port names must match keys in containers.<any>.ports. A service port carries no transport protocol of its own: it takes the transport of the container port its name resolves to, so a port's transport is declared once, on the container port, and the service exposure cannot disagree with what the container opened. |

_Additional properties are not permitted._
