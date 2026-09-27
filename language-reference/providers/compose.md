# Compose Provider

The compose provider renders Aggrega Recipes into a Docker Compose file. The provider assembles per-`(path, provider)`: every boundary's compose contributors are routed to the assembler keyed on the boundary's evaluated `directory:` joined with the per-component `subDirectory:`, and that assembler emits one `docker-compose.yaml` containing every contributor at that path. Two sibling boundaries that evaluate to the same path collapse into a single merged compose file — the canonical example is a parent boundary plus two child boundaries with `directory: "{{ .parent_boundary.directory }}"` (the [compose-bridge proof case](../entities/featurerecipe.md#compose-bridge-proof-case)).

## Supported input kinds

The compose provider accepts all three Recipe input kinds:

- **Sourced mode.** A Recipe with `source:` pointing at an existing compose file plus `valuesMapping:` producing an overlay document. The base compose file is loaded, the overlay is evaluated, and the two are deep-merged per docker-compose's native overlay semantics.
- **Workload mode.** A Recipe with `workload:` (inline or `$import:`-loaded) declares a `Workload` document. The provider synthesizes one or more compose services from the Workload spec.
- **Artifacts mode.** A Recipe's `artifacts:` entries evaluate to compose fragments, which merge into the assembled file under the rules in [Artifacts-emitted compose fragments](#artifacts-emitted-compose-fragments). Artifacts may ride alongside a source or a Workload, and they may also be a Recipe's whole output: a Recipe declaring `artifacts:` and neither `source:` nor `workload:` renders here, contributing whatever its fragments declare. That is how a component that is only resources — a shared network and volume set, a seeded config — reaches a compose deployment without a placeholder Workload standing in for compute it does not have.

The three kinds compose by addition, and a Recipe declaring none of them is refused when it loads. A `valuesMapping:` with no `source:` beside it is refused when the Recipe loads too, whichever provider it names: there is nothing for the overlay to be applied to, and the diagnostic asks you to declare the `source:` pointer or drop the `valuesMapping:`.

## Workload feature mapping

When a Recipe declares `workload:`, the provider translates the platform-owned Workload shape into compose primitives. The mapping is intentionally narrow — Compose's surface is shape-poorer than Kubernetes, and several Workload features degrade to the closest compose equivalent with documented loss.

### Container fields

| Workload field | Compose field |
| --- | --- |
| `image` | `image` |
| `command` | `entrypoint` (list form) — it overrides the image's entry point, which is the compose key that does that |
| `args` | `command` (list form) — it supplies the arguments the entry point receives, which is what compose's `command` overrides |
| `variables` | `environment` (map form) |
| `attachments[as: env]` | `environment` entry with an empty value, and a warning naming the entry (see [What the compose provider does not deliver](#what-the-compose-provider-does-not-deliver)) |
| `attachments[as: file]` | `volumes` long-form bind-mount, read-only |
| `volumeMounts` | the compose primitive the referenced Volume variant maps to — a `volumes` long-form entry, a service-level `tmpfs:` entry, or a service-level `configs:` reference (see [Volumes](#volumes)) |
| `ports` | implicit (compose containers expose ports the image listens on) |
| `restartPolicy: Always` | `restart: unless-stopped` |
| `restartPolicy: OnFailure` | `restart: on-failure` |
| `restartPolicy: Never` | `restart: no` |

### Container resources

A container's `resources` reach compose's `deploy.resources` block, which docker compose honours in non-swarm mode. Kubernetes `requests` express a guaranteed minimum, so they become compose `reservations`; `limits` express a hard cap, so they stay `limits`.

| Workload field | Compose field | Translation |
| --- | --- | --- |
| `resources.requests.cpu` | `deploy.resources.reservations.cpus` | A decimal core count. A core count written as a bare number (`2`, `0.5`) is emitted as written; any other form is converted from its value (`500m` → `0.5`, `1500m` → `1.5`, `5n` → `0.000000005`, `1e1` → `10`) |
| `resources.limits.cpu` | `deploy.resources.limits.cpus` | Same conversion |
| `resources.requests.memory` | `deploy.resources.reservations.memory` | An exact byte count, converted from the value in whichever form it is written — `8Gi` becomes `8589934592`, `1.5Gi` becomes `1610612736`, `1e3` becomes `1000` |
| `resources.limits.memory` | `deploy.resources.limits.memory` | Same conversion |
| an extended resource key — `nvidia.com/gpu`, `amd.com/gpu`, any `<domain>/<name>` | — | No single-host compose analog. The key is dropped and the build raises an `unsupported-field` warning naming it, one per distinct key however many of `requests` and `limits` carried it. Its value is not emitted, so it is not checked |

Each `cpu` and `memory` value is read as a quantity, in the form set out in [Workload → Resource quantities](../entities/workload.md#resource-quantities), on the Workload as the Recipe's templates evaluated it. Two things halt the build with a `TRANSLATION_ERROR`, and the error says which of the two it met, naming the container's path, whether the value is a request or a limit, the resource and the value:

- **a value that is not a quantity** — `lots`, `1.5 cores`, or the `m` an empty template leaves in `"{{ .infra.cpu }}m"`;
- **a quantity compose cannot represent exactly** — a negative amount; a memory amount that is not a whole number of bytes (`1500m`, `4u`) or is larger than 9223372036854775807 bytes (`8Ei`); a cpu amount finer than nine decimal places of a core, the finest precision a Kubernetes quantity itself keeps, or larger than 9223372036.854775807 cores.

Nothing is rounded, and no value is emitted that means something else.

**A GPU request is the common case of the dropped-key row.** A Workload asking for `nvidia.com/gpu` renders a service carrying no GPU reservation of any kind, and the build names the key it dropped. Pair that with the `runtimeClassName` row in [Pod-level fields](#pod-level-fields): a Workload authored to run on GPU reaches compose as a plain CPU service, and says so twice — once for the resource and once for the runtime.

### Probes

A Workload's three probe slots (`live`, `ready`, `startup`) collapse to compose's single `healthcheck` per service, with priority `live > ready > startup` (the most-canonical-liveness signal wins). Where that collapse discards a slot the author declared, the build raises an `unsupported-field` warning naming the slot that was translated and the slots that were dropped, so intent reaching no part of the output is reported rather than lost. A `health` block declaring one slot translates without loss and raises nothing.

| Workload probe shape | Compose `healthcheck.test` |
| --- | --- |
| `http: /path` | `["CMD-SHELL", "curl -f http://localhost:<port>/path \|\| exit 1"]` |
| `tcp: <port>` | `["CMD-SHELL", "nc -z localhost <port>"]` |
| `exec: [cmd, ...]` | `["CMD", cmd, ...]` |

The HTTP form requires the container to declare at least one named port; the synthesizer picks the alphabetically-first port name and uses its number to build the `curl` URL. Containers with no ports declared cannot use HTTP probes — the compiler halts with a `TRANSLATION_ERROR` naming the offending probe.

Probe timeout fields map to compose-style duration strings:

| Workload field | Compose `healthcheck` field |
| --- | --- |
| `periodSeconds` | `interval: <n>s` |
| `timeoutSeconds` | `timeout: <n>s` |
| `failureThreshold` | `retries: <n>` |
| `initialDelaySeconds` | `start_period: <n>s` |

### Volumes

Compose has a config primitive of its own, which is what a `configmap` volume translates to. It has no Kubernetes-equivalent for Secret or per-replica volume templates, so those variants degrade to the closest compose primitive:

| Workload volume variant | Compose translation | Loss notes |
| --- | --- | --- |
| `ephemeral` | service-level `tmpfs:` list entry | `sizeLimit` is not preserved (compose tmpfs short-form lacks size). An authored `sizeLimit` raises an `unsupported-field` warning naming it at its authored coordinate (`volumes.<name>.ephemeral.sizeLimit`), whether or not a container mounts the volume; leaving the field out raises nothing |
| `configmap` | service-level `configs:` reference naming the configmap, mounted at the volume mount's path | 🔴 **The mount path is the path of a single file, not of a directory.** Compose writes the config's content to exactly the target path, where a Kubernetes target mounting a ConfigMap at a path produces a *directory* holding one file per key. So the same authored `path:` denotes a file here and a directory there: point a `configmap` volume's mount at the filename the container should read (`/seed/config.json`), not at the directory that would contain it, and a Recipe authored for both targets carries a different path per target. Nothing in the build can catch a path written for the other target's shape — the path is an opaque string the compiler pipes through, and the emitted output is valid either way. The reference is by **name**, exactly as a Kubernetes target references a ConfigMap resource — nothing reads the config's content. The matching top-level `configs:` entry comes from the Recipe's `artifacts:` input, whose compose fragment declares it with inline `content:`; a reference with no such entry halts the build (see [Artifacts-emitted compose fragments](#artifacts-emitted-compose-fragments)). A `configs:` reference carries the config name and the mount path and nothing else, so the mount's `readOnly` has no separate expression |
| `secret` | `volumes` long-form bind-mount, read-only | A secret volume deliberately does **not** follow the `configmap` translation: an inline `configs:` entry would write the secret's value into the emitted compose file in plaintext, and the compiler never resolves a secret into plaintext — a secret stays a pointer through every stage of the build. The bind source is the secret's `source` name, resolved as a path the operator makes reachable on the compose host independently of the build |
| `persistent` | named volume + top-level `volumes: { <volume-name>: {} }` declaration, named per [How a volume name is derived](#how-a-volume-name-is-derived) | Storage class and size are not preserved (compose has no equivalent shape) |
| `persistentTemplate` | named volume + top-level declaration, named the same way (same as `persistent`) | Companion of `form: stateful`; compose has no per-replica volume templating primitive, so the per-replica behaviour is lost |

**A volume says which variant it is and nothing more.** A `secret` volume has exactly one translation — the read-only bind mount above — and a volume carries no `as:` field to select another. Delivering what a slot published as an environment variable is a container `attachments` entry (`as: env`) rather than a volume; what compose does with one is under [What the compose provider does not deliver](#what-the-compose-provider-does-not-deliver).

**Three variants carry a storage size, and only one of them warns that the size was dropped.** The difference is whether you had a choice. An `ephemeral` volume's `sizeLimit` is optional, so writing it was a decision, and the warning tells you the value shapes nothing on this target and can be removed — it is advisory and out-of-band, the emitted file is byte-for-byte what it would be without it, and `--no-unsupported-field-warnings` silences it along with the rest of the class. A `persistent` or `persistentTemplate` volume's `size` is required, so no version of the document leaves it out: a per-build warning there would fire on every stateful workload while naming nothing you could change, so the difference is taught here instead of reported on each build. Targeting compose, a persistent volume's `size`, `class`, and `accessModes` shape nothing in the emitted file — what you get is a plain named volume, sized and backed by whatever the compose host's volume driver does by default. Size the underlying storage on the host, or on the Kubernetes target where the fields do reach the output.

A volume that no container mounts raises an `unsupported-field` warning naming it at its authored coordinate (`volumes.<name>`), because what reaches the emitted file then differs sharply by variant. `persistent` and `persistentTemplate` still produce their top-level declaration, so the volume is created and nothing uses it. `ephemeral`, `configmap`, and `secret` have no expression outside the mount itself — each translates to something written at the mount path, a `tmpfs` entry, a `configs` reference, or a bind-mount respectively — so with nothing mounting one, the volume you declared leaves no trace in the output at all. That second case is the reason the warning exists: without it, a `configmap` volume whose mount you forgot would simply be absent, with nothing in the emitted file to notice. Every container of the workload counts as a mounter, [init containers](#init-containers) included, so a volume mounted only by an init container is wired and raises nothing. The warning is advisory and out-of-band — the emitted file is byte-for-byte what it would be without it — and `--no-unsupported-field-warnings` silences the class.

### How a volume name is derived

A `persistent` or `persistentTemplate` volume becomes a compose named volume: one top-level `volumes:` entry, referenced by every container that mounts it. A compose volume is shared storage, and the top-level `volumes:` block unions its entries by name — so two authored volumes arriving at one name become one volume both containers write into, with nothing in the emitted file to show that two were meant. The name is therefore built from the two identities that together say which volume it is: the `<component>` the volume belongs to, and the name the Workload gave the volume under `volumes:`.

A compose volume name accepts a narrower set of characters than either identity may carry: letters, digits, dots, underscores and hyphens. Rather than substitute for a character compose does not accept, the derivation writes it out, so two volumes that differ at all arrive at two names — and an assembled name can be read back into the two identities it was built from.

- A letter, a digit, a dot and an underscore are carried through exactly as authored.
- A hyphen is kept as authored wherever the character after it is carried through directly and is not a lowercase `z`. A hyphen followed by a lowercase `z` opens an escape, so an authored one in that position is itself written out — `api-zone` becomes `api-zhzone`, which is what lets any name be read back without guessing. A hyphen with nothing after it is written out for the same reason, so `db-` gives `db-zh`.
- Every other character is written as `-z` followed by a letter naming it: `s` for a path separator, `h` for a hyphen the rule above does not keep. Anything else — a space and a non-ASCII letter included — is written as `x` and the character's six-digit hexadecimal code point, and a byte that begins no character at all as `b` and its own two-digit value, so a name that is not valid text is still written out distinctly rather than collapsed.
- An empty value is written `-ze`, which no non-empty value can produce.
- The two identities are joined by `--`. A single encoded identity never contains that pair, so the joined name says unambiguously where one identity ends and the other begins.

So the component `store` with a volume the Workload calls `data` gives the volume name `store--data`, and `db-server` with `data` gives `db-server--data`. Identical input always produces the identical name.

**The doubled join is what makes the pair unambiguous, and a one-character join cannot be.** Either identity may itself carry a hyphen, so a single-hyphen join leaves a name that divides in more than one place: `db` with a volume called `data-cache` and `db-data` with a volume called `cache` would both spell `db-data-cache`, and since the top-level block unions by name the two components would share one volume with nothing in the emitted file to show it. An encoded identity never contains a pair of hyphens, so the doubled join admits no second reading: the two reach `db--data-cache` and `db-data--cache`.

**Changing either identity renames the compose volume, and compose does not rename a volume in place.** The volume is created afresh under the new name while the old one stays behind with the data in it, so the container comes up against empty storage and the contents sit in a volume nothing mounts. Rename either identity only as a replacement to be planned — backed up, copied across, or scheduled — rather than as a change to roll out.

### Controller form

The Workload's `form` selects an abstract controller shape (see [entities/workload.md](../entities/workload.md)). Compose renders `stateless` and `stateful` (and the empty default, treated as `stateless`) as long-running services; the `stateful` form adds the named volume for a `persistentTemplate` companion. The `daemon`, `scheduled`, and `task` forms have no clean single-host compose mapping, so a Workload declaring one of them targeting a compose boundary halts with a `TRANSLATION_ERROR` naming the form and the supported set — compose does not degrade an unsupported form into a plain service that misrepresents the intent.

### Service exposure

A Workload `services` entry's `type` field decides whether compose publishes ports:

| Workload service type | Compose behaviour |
| --- | --- |
| `ClusterIP` | No `ports:` publishing — the service is reachable only on the compose network |
| `NodePort` | `ports: [<host>:<container>]` publishing |
| `LoadBalancer` | `ports: [<host>:<container>]` publishing (compose has no managed-loadbalancer equivalent; the host-port publish is the closest analogue) |
| `Headless` | No `ports:` publishing |

When multiple services on a single Workload publish overlapping ports, the most-publishing entry wins per port (any `NodePort` or `LoadBalancer` reference triggers publishing).

**Port transport.** A published entry carries the transport declared on the container port it names, as compose's `/protocol` suffix: `53:53/udp`. A port that declares no transport publishes as `<host>:<container>` with no suffix, leaving compose's own default in force. Compose spells a published port's transport as `tcp` or `udp`; a port declaring `SCTP` has no compose spelling, so it halts with a `TRANSLATION_ERROR` rather than publishing a port that would carry a different transport. A container port that no service publishes reaches no part of the compose file at all, so a transport declared on such a port has nothing to be spelled onto and does not halt.

## Multi-container Workloads

A Workload with multiple containers becomes one main service plus one sidecar service per non-main container. The main container is the one named `main` (when present) or the first container in declaration order. Sidecars share the main service's network namespace via `network_mode: "service:<main>"` — the closest compose primitive to a Kubernetes pod's shared-network model.

### Pod-level fields

Pod-level Workload fields apply to the main service only — sidecars share the main service's network namespace and pod-level identity, and an [init service](#init-containers) follows the same rule.

Several map onto a compose service field:

| Workload field | Compose field |
| --- | --- |
| `podSecurityContext.runAsUser` / `runAsGroup` | `user` — a container-level `securityContext.runAsUser` wins over it |
| `terminationGracePeriodSeconds` | `stop_grace_period: <n>s` |
| `dnsConfig.nameservers` / `dnsConfig.searches` | `dns` / `dns_search` |
| `hostAliases` | one `extra_hosts` entry per hostname, in author order |
| `hostNetwork: true` | `network_mode: host` |

**Running on the node's network.** A workload declaring `hostNetwork: true` gets `network_mode: host` on its own service, and that service is then left off the boundary network rather than being attached to it: compose refuses a service that declares both `networks:` and `network_mode:`, so the two are alternatives rather than additions. The practical consequence is the one host networking always carries — peers no longer reach the service by its compose service name over that network, because it is no longer on it; they reach it on the host's own addresses, which is what the declaration asked for. Every other service on the boundary is unaffected.

Two shapes compose with it. A sidecar keeps naming the main service (`network_mode: "service:<main>"`), so it follows the main service onto the host's network without declaring anything itself — the same way a Kubernetes pod's containers share one namespace. An init service does not: it joins the boundary network in its own right, because sharing the main service's namespace would make the main service's wait on it circular. So a workload with both `hostNetwork` and `initContainers` runs its own service on the host's network while its init services stay on the boundary network, which is narrower than the pod shape it models; an `unsupported-field` warning names that difference rather than leaving it to be found at run time.

The rest have no single-host equivalent. **None is dropped in silence:** each authored one raises an `unsupported-field` warning naming the field, so an author learns which setting the target could not honour rather than discovering it from the running stack.

| Workload field | Why compose cannot honour it |
| --- | --- |
| `scheduling` | Placement — `nodeSelector`, `affinity`, `tolerations`, `topologySpreadConstraints` — presumes a scheduler choosing among nodes. Compose runs on one host |
| `replicas` | Compose's own replica count lives under `deploy:` and is a swarm-mode feature |
| `runtimeClassName` | Selecting an alternative container runtime — a GPU-enabled one, for example — has no compose expression |
| `priorityClassName` | Preemption ordering presumes a scheduler |
| `serviceAccount` | Workload identity is a cluster concept |
| `imagePullSecrets` | Registry credentials on a compose host are the host's own login state, not a field of the file |
| `dnsPolicy`, `dnsConfig.options` | Compose exposes `dns` and `dns_search` and nothing finer |

Container-level `securityContext` translates partially: `readOnlyRootFilesystem` → `read_only`, `capabilities.add` / `drop` → `cap_add` / `cap_drop`, `runAsUser` / `runAsGroup` → `user`. `runAsNonRoot` has no compose expression and raises the same `unsupported-field` warning.

Every warning in this section is advisory and out-of-band: the build succeeds, and the emitted file is byte-for-byte what it would be without it. `--no-unsupported-field-warnings` silences the class.

## Init containers

A Workload's `initContainers` entries become services of their own, using compose's run-to-completion idiom. Each entry adds one service named `<component>-<container-name>`, on the same naming shape sidecars use; an entry that omits `name` takes the positional `init-<index>` name the [Workload reference](../entities/workload.md) documents.

The ordering the authoring contract promises — the init containers run to completion in the order they are written, and every other container starts only after all of them have finished — is expressed with `depends_on`'s long form:

- Each init service after the first waits on its predecessor with `condition: service_completed_successfully`.
- The main service, and every sidecar service, waits on the **last** init service with the same condition. Waiting on the last one is sufficient because the init services form a chain.
- Each init service carries `restart: "no"`. An init service runs once; a service that came back up would never reach the completed state its dependents are waiting on, so a `restartPolicy` authored on an init container does not change this.

```yaml
services:
  platform:
    image: platform:1.0
    depends_on:
      platform-verify-seed:
        condition: service_completed_successfully
  platform-import-seed:
    image: platform:1.0
    restart: "no"
  platform-verify-seed:
    image: platform:1.0
    depends_on:
      platform-import-seed:
        condition: service_completed_successfully
    restart: "no"
```

An init container is translated exactly as any other container: its `image` (including the registry rewrite an `aggrega.ai/image-registry` annotation applies), `command`, `args`, `variables`, `attachments`, `volumeMounts`, and `securityContext` all reach the init service. That is what makes the configuration an init container carries — most often a file it mounts and writes into a volume the main container also mounts — survive onto the compose target rather than being lost with the container. A shape compose cannot express fails the same way for an init container as for an ordinary one: a declared `lifecycle` or `envFrom` halts with a `TRANSLATION_ERROR` naming the init container it came from.

Two differences from the main service follow from an init service being a non-main service:

- **Pod-level Workload fields are not applied**, the same rule sidecars follow.
- **An init service joins its boundary's network directly** rather than sharing the main service's network namespace the way a sidecar does. It has to: the main service waits on the init service, and sharing a namespace is itself a dependency on the main service, which would close the wait into a cycle compose refuses to start. An init container therefore reaches other services on the boundary network by service name, but it does not share the main service's `localhost`.

Init services and sidecar services share one name namespace, so an `initContainers` entry and a `containers` entry may not carry the same name. When they do, the compiler halts with a `TRANSLATION_ERROR` naming the node, the container name, and the service name both wanted, rather than letting one service quietly replace the other.

Emitting the completion condition raises no minimum Compose version. `condition` and its values belong to the base Compose Specification — unlike the `restart` and `required` fields alongside them in the same long-form block, which the specification ties to particular Compose releases. The highest version the compose provider asks for remains the **≥ 2.23.1** that inline `configs.content` needs. That floor reaches any compose output carrying a config with inline `content:`, which is how the file behind a `configmap` volume and the config behind a bridged cross-network edge both arrive — not one authoring path.

## Per-boundary networking

A compose-contributing boundary contributes a Docker network, and every service in it joins that network; sidecars inherit it through their `network_mode` reference to the main service. Which network a node lands on is read from the `aggrega.ai/namespace` annotation on that node, falling back to the boundary path where the node carries no such annotation — so a boundary whose nodes all carry the same annotation, or none at all, contributes exactly one network, and a boundary whose nodes carry different annotations contributes one per distinct annotation. [How a network name is derived](#how-a-network-name-is-derived) is the name that identity produces.

### How a network name is derived

A compose network is shared L3 connectivity, and the top-level `networks:` block unions its entries by name — so two identities arriving at one name become one network both sets of services sit on, reaching each other by service name, with nothing in the emitted file to show that two networks were meant. The name is therefore built from the identity that says which network it is: the node's `aggrega.ai/namespace` annotation, or the boundary path where the node carries none.

A compose network name accepts a narrower set of characters than either identity may carry: letters, digits, dots, underscores and hyphens. Rather than substitute for a character compose does not accept, the derivation writes it out, so two identities that differ at all arrive at two networks — and a name can be read back into the identity it was built from.

- A letter, a digit, a dot and an underscore are carried through exactly as authored, in the case they were authored in. So `prod` and `Prod` are two networks, not one.
- A hyphen is kept as authored wherever the character after it is carried through directly and is not a lowercase `z`. A hyphen followed by a lowercase `z` opens an escape, so an authored one in that position is itself written out — `api-zone` becomes `api-zhzone`, which is what lets any name be read back without guessing. A hyphen with nothing after it is written out for the same reason, so `db-` gives `db-zh`.
- Every other character is written as `-z` followed by a letter naming it: `s` for a path separator, `h` for a hyphen the rule above does not keep. Anything else — a space and a non-ASCII letter included — is written as `x` and the character's six-digit hexadecimal code point, and a byte that begins no character at all as `b` and its own two-digit value, so an identity that is not valid text is still written out distinctly rather than collapsed.
- An identity that is absent altogether — a node with no `aggrega.ai/namespace` annotation under a boundary with no path — is written `-ze`, which no identity an author wrote can produce. A network with no identity therefore never shares connectivity with one that has an identity spelled some particular way.

So a namespace of `prod` gives the network `prod`, `core-net` gives `core-net`, and a boundary path of `dist/app/compose` gives `dist-zsapp-zscompose`. Identical input always produces the identical name.

**A namespace and a boundary path are written into the same space.** They are two ways of naming the same thing — which network a node is on — so a node whose namespace is `edge` and a node with no namespace under a boundary path spelled `edge` deliberately land on one network, exactly as two boundaries carrying the same `aggrega.ai/namespace` annotation do. Where you want two nodes apart, give them identities that differ.

**Changing a node's identity renames the compose network, and compose does not rename a network in place.** The network is created afresh under the new name and every service on it is recreated to attach to it, while the old network stays behind until something removes it. A network carries no data, so nothing is lost — but the containers on it do restart, and anything holding a connection across the change sees it drop. Change a namespace annotation or a boundary path as a redeployment to be planned rather than as a value to adjust in place.

When two boundaries collapse into one assembly path (shared `directory:`), the merged `docker-compose.yaml` declares one top-level `networks:` entry per contributing boundary. Services from different boundaries within the same compose file can communicate by their service names within compose's default DNS resolution, subject to compose's own cross-network reachability rules. Cross-network L4 routing within a single compose file is what the `compose-bridge` Feature enables: attached at the common-ancestor boundary, it derives a gateway from the boundary's cross-network `uses` edges — generating an `aggrega-gw` service whose nginx `stream` config proxies each bridged edge (one `server` block per edge, on the target's port with a `portBase` collision fallback) and rewriting each consumer's host env var to `aggrega-gw:<port>`. The compiler generates that config and delivers it as a **mounted compose config** — a top-level `configs:` entry with inline `content:`, referenced from the gateway and mounted at `/etc/nginx/nginx.conf`; it is not an operator-mounted concern. The `stream` config carries a `resolver` directive and proxies through a per-edge variable (`set $uN <host>; proxy_pass $uN`) so each upstream resolves at connection time rather than once at startup — a bare `proxy_pass` to a not-yet-running target would otherwise fail the gateway at boot. (The `$` in those variables is escaped to `$$` inside `configs.content` so Docker Compose's own `$`-interpolation leaves a literal `$` for nginx.) Inline `configs.content` requires Docker Compose **≥ 2.23.1**. See the [compose-bridge proof case](../entities/featurerecipe.md#compose-bridge-proof-case).

## `depends_on` inference

The compose provider derives `depends_on` automatically from the IR's `uses` edges. For each edge whose source and target both contribute services to the merged compose file, the provider adds `depends_on: [<target>]` to the source service.

**The dependency lands on the source component's own service, and on no other service that component contributes.** A component that also declares [init containers](#init-containers) contributes one run-to-completion service per entry, and none of those receives the edge-derived dependency — an edge names the component, and an init service carries a name of its own. So an init container that has to reach the edge's target, such as a schema migration against a database the component `uses`, carries no ordering against that target and may run before it is reachable, while the component's own service waits both for the init chain to complete and for the target to have started.

Edge-derived entries are emitted **ungated**: they have `service_started` semantics regardless of whether the target declares a healthcheck. Gating them on the target's health — which would let the compose runtime block startup until the target's healthcheck reports healthy — is expressible but is not what a `uses` edge currently means. A [deployment wave](#deployment-wave-ordering) naming the same pair is the one thing that changes the condition on an edge-derived entry, and it does so because the wave asks for it rather than because the edge does.

Edge-derived entries are emitted in alphabetical target order for output stability. Edges whose source or target are served by a different provider (helm or helm-chart) are skipped — `depends_on` only applies within the compose-served subset of the Release.

A service's `depends_on` emits in one of compose's two forms, never a mix, because compose requires a condition on every entry of the long form:

- **Short-form list** (`depends_on: [<service-name>]`) when no entry on that service carries a condition. That is every service whose only dependencies come from `uses` edges.
- **Long-form mapping** when any entry carries one — which happens when the service also waits on an [init container](#init-containers), or when a [deployment wave](#deployment-wave-ordering) orders it. There, the edge-derived entries emit the explicit `condition: service_started`, which the Compose Specification defines as the short form's equivalent, so their meaning is unchanged.

Within a service the sources keep their own order and do not interleave: the init-chain wait, whose order is the order the author wrote the list in, is emitted first, then the alphabetically-ordered edge-derived entries, then the alphabetically-ordered wave-derived ones.

## Deployment wave ordering

A Release boundary's `syncWave:` value orders the services of the compose file that boundary renders into. Every component in the boundary inherits the boundary's wave, and where several boundaries share one `directory:` — so their contributions collapse into a single `docker-compose.yaml` — the merged file holds more than one wave and the provider expresses the ordering between them as `depends_on`.

**Each service waits on every service of the immediately-preceding wave that has any services, and on no earlier wave than that.** Compose resolves the rest transitively: a service in wave `2` waits on wave `1`, which waits on wave `0`, so the whole sequence is ordered while each service's own list stays the size of one wave rather than of the whole file. Waves need not be contiguous, and negative values are ordinary — `-1` is a common choice for a migration that runs before everything else.

**The condition depends on what the target can satisfy.** A wave means the earlier group is up before the later one starts, which is readiness rather than process launch, so:

- where the target service declares a `healthcheck`, the wait is `condition: service_healthy`;
- where it does not, the wait is `condition: service_started`, because a service with no healthcheck can never report healthy and a health-gated wait on it would never be satisfied — the file would never come up.

The weaker condition is visible in the emitted file beside the stronger one, and the build additionally names each such service in a warning, so an author who expected readiness ordering learns which part of the wave they declared arrives as start ordering only. The warning is advisory: the build succeeds and the rendered bytes are exactly what they would be without it. Adding a `health:` block to that container is what upgrades the wait. `--no-unsupported-field-warnings` silences the class.

**The wave is still recorded as a label.** Ordering is added beside the `aggrega.ai/sync-wave` label, not in place of it: the label is where a reader inspecting the emitted file sees which wave a service came from, which the `depends_on` entries do not state.

**Where a wave and a `uses` edge name the same pair, one entry carries both.** Compose accepts one entry per dependency, so a service that both `uses` a target and sits a wave after it emits a single entry gated on the wave's condition — the wave's requirement is the stronger of the two and it is the one expressed.

**A boundary whose components all sit in one wave emits nothing from this.** So does a Release that declares no `syncWave` at all: every contributor carries the field's default of `0`, the merged file holds a single wave, and the output is exactly what it would be if the provider expressed no wave ordering.

**Ordering across two compose files is not expressible, and it is not approximated.** `depends_on` names a service inside the same file, and boundaries that evaluate to distinct assembly paths produce distinct `docker-compose.yaml` files that the compose runtime treats as independent projects. So a wave orders every service in the file it renders into and nothing outside it. Sequencing two compose projects is the operator's concern, the same way [cross-file routing](#what-the-compose-provider-does-not-deliver) is; declaring a shared `directory:` is what brings two boundaries into one file, and it is an output-shape decision to take for its own reasons rather than to obtain ordering.

The emitted `depends_on` reflects what was declared — both the `uses` edges and the waves. Compose refuses a circular dependency set, so an edge whose consumer sits in an *earlier* wave than the target it uses states the opposite of what the waves state, and the merged file expresses both. Keep the edge direction and the wave order consistent.

```yaml
# release.yaml fragment — three boundaries collapsing onto one compose file
boundaries:
  data:
    directory: ./dist/cluster
    syncWave: -1
    components:
      migrator: {}          # no health: block
  core:
    directory: ./dist/cluster
    syncWave: 0
    components:
      store: {}             # declares health:
  edge:
    directory: ./dist/cluster
    syncWave: 1
    components:
      frontend: {}          # uses: store
```

```yaml
# dist/cluster/compose/docker-compose.yaml (abridged)
services:
  frontend:
    labels:
      aggrega.ai/sync-wave: "1"
    depends_on:
      store:
        condition: service_healthy    # store declares a healthcheck
  migrator:
    labels:
      aggrega.ai/sync-wave: "-1"      # lowest wave: waits on nothing
  store:
    depends_on:
      migrator:
        condition: service_started    # migrator declares no healthcheck
    healthcheck:
      test: [CMD-SHELL, "nc -z localhost 5432"]
```

`frontend` does not name `migrator`: the ordering reaches the immediately-preceding wave and compose chains the rest through `store`.

## Sourced mode

The compose provider's `source:` names a docker-compose YAML file that the provider can read and parse, and it accepts both of the shapes the `source:` field takes: a **bare filesystem path string**, and a **structured object** whose `url:` carries the location. Wherever that location is a filesystem path, it is anchored to the directory holding the `recipe.yaml` that declares it, not to the directory the build is invoked from, and it must stay inside that directory: one that climbs out of it, or an absolute one, is refused, because every file a publication of the Recipe carries is taken from its directory — see [`entities/recipe.md`](../entities/recipe.md) "Content paths stay inside the Recipe's own directory". The file named this way is published with the Recipe, while a file beside the Recipe that nothing it declares names is not.

```yaml
spec:
  capability: compose
  source: ./docker-compose.base.yaml     # filesystem path to the base compose file
  valuesMapping: |
    services:
      api:
        image: "{{ .values.image }}"
```

In the structured shape, what `url:` carries decides whether anything is fetched. A fragment published over `https://` is fetched and pinned with `kind: compose-https-fragment`; `aggrega pull` acquires it and the build reads it from the cache. A `url:` naming a filesystem path is not fetched — it is read from disk, anchored exactly as the bare-string form above, and [`aggrega pin`](../cli/aggrega-pin.md) records the digest of the file it names in the `entity.lock` beside the Recipe, which a build then compares before the fragment is read. Vendoring a remote fragment locally and pointing `source:` at the vendored copy is supported as an alternative to fetching, and is not required. The schema accepts an open structured object, so a provider Wasm plugin can later validate provider-declared source keys — `planned`.

A Recipe with `source: <path-to-compose-file>` and `valuesMapping:` runs the following pipeline:

1. The base compose file at `<path>` is read and parsed as YAML.
2. The `valuesMapping` template evaluates against the Recipe's TemplateContext. Its output is treated as a compose overlay document — a partial compose file that augments or overrides fields in the base.
3. Base and overlay are deep-merged using docker-compose's native overlay semantics.

The deep-merge rules:

- **Scalars: overlay wins.** When both base and overlay set the same scalar field, the overlay's value replaces the base's value.
- **Maps: merge recursively.** When both base and overlay set the same map field, the merge recurses into the map. Keys present in both follow the same rules; keys present in only one are preserved as-is.
- **Lists: replace.** When both base and overlay set the same list field, the overlay's list replaces the base's list entirely (no element-wise merging or appending). This matches `docker compose -f base.yaml -f overlay.yaml config` behaviour.

The merged document then flows into the Release-level merge alongside any synthesized-mode contributions, with the same per-boundary networking and `depends_on` inference.

## Per-`(path, provider)` output

Each compose assembly path produces one `docker-compose.yaml`. Boundaries that evaluate to distinct paths produce distinct compose files; boundaries that share an evaluated path produce one merged compose file containing every contributor at that path. The path is the boundary's `directory:` joined with the per-component `subDirectory:` (which defaults to `{{ .capability }}` so compose contributors land under a `compose/` subfolder by default).

Service-name collisions within a single assembly path halt the build. When two different nodes contribute services with the same instance ID at the same `(path, provider)` tuple, the compiler halts and the diagnostic names every contributing `(boundary, node)` tuple in alphabetical order. The author resolves the collision by renaming one of the contributors (typically by adjusting the node's identifier so the synthesizer produces a different service name), or by routing the contributors to distinct paths via different `directory:` declarations.

Top-level volumes union within an assembly path, and two contributors may declare one name provided they agree about it. A named volume is one physical volume, so two identical declarations both describe exactly the entry the assembled file ends up with, and it keeps a single entry under that name. A volume the provider derived carries no body, so two of those agree trivially, and they cannot meet in any case (see [How a volume name is derived](#how-a-volume-name-is-derived)).

An authored `volumes:` entry is the one to watch, because it may carry a body of its own — a `driver`, `driver_opts`, or `labels`. Where two contributors declare one name with **different** bodies, the build halts under `TRANSLATION_ERROR`, naming the volume and every contributing `(boundary, node)` tuple. Two authors disagreeing about a single volume have no answer the assembler can choose between: keeping either body discards what the other author wrote, from a build that would otherwise succeed. Resolve it by making the two declarations identical, where both authors meant the same volume, or by renaming one of them, where they meant two. Top-level networks are one-per-contributing-boundary, named per [How a network name is derived](#how-a-network-name-is-derived); two contributing boundaries with the same `aggrega.ai/namespace` annotation merge to a single network shared by both.

### A Feature attached to a component contributes to the same file

A Feature attached to a component contributes its services to the `docker-compose.yaml` its host component assembles into, on the same terms as the host's own Recipe. There is no second file beside it: one assembly path produces one document, so an attached Feature's services are either in that document or they are not deployed at all. Detaching the Feature removes exactly those services and leaves the host component's own untouched.

They are contributors at that assembly path like any other, so everything above applies to them unchanged — the service-name rule, and the requirement that two contributors declaring one top-level volume or config name agree about what it is. They also join the same network as the rest of the boundary, so a component and a Feature attached to it reach each other by service name with nothing further to declare.

Each service a Feature contributes carries the identity composed for that attachment rather than the host component's, so the two stay distinguishable inside a document both contributed to. [Labels and annotations](../vocabulary/labels-and-annotations.md) covers how that identity is built.

This is a different mechanism from a Workload's container-level `attachments:` block, and the two are easy to read as one because they share a word. Attaching a Feature to a component adds services to the assembled document; a container's `attachments:` entry reads a credential a slot published into that one container, and is covered under [Container fields](#container-fields).

### Artifacts-emitted compose fragments

When a Recipe's `artifacts:` block evaluates to compose YAML — a fragment carrying its own `services:`, `volumes:`, `configs:`, or `networks:` blocks (each entry inline or per-entry `$import:`-loaded) — the merge into the per-`(path, provider)` assembly follows shape-specific rules:

- **`services:` from artifacts merge into the assembled compose file alongside per-component services.** A service name contributed by two different components at the same assembly path halts, and the diagnostic names every contributor. A collision *within a single component* — between that component's own artifact fragment and the services synthesized for it — is not detected, and the later contribution replaces the earlier one, so keep an artifact-authored service name distinct from the `<component>` and `<component>-<container-name>` names the synthesizer produces.
- **`volumes:` from artifacts merge into the top-level `volumes:` block.** Two entries reaching one name leave a single entry under it where they declare it identically, matching the same rule as per-component volumes; two that declare it differently halt the build. Because an artifact fragment writes its own bodies, this is the path on which two contributors are most likely to disagree. Keep an artifact-authored volume name distinct from the others at its assembly path, including from the `<component>--<volume-name>` shape the derivation produces — unless two contributors are meant to describe one shared volume, in which case their declarations must match.
- **`configs:` from artifacts merge into the top-level `configs:` block.** This is how the file behind a `configmap` volume reaches the assembly: the volume becomes a service-level `configs:` reference naming the configmap, and the artifact fragment declares an entry of that name with inline `content:`. Once the assembly path's fragments are unioned, every service-level reference must resolve to a declared entry, or the build halts with `TRANSLATION_ERROR` naming each unresolved reference — the service, the config name, and the mount path. The check runs over the completed union rather than per component, so one component may reference a config another component at the same assembly path declares. The union reconciles by name where the contributors agree: two declaring one config name with identical `content:` leave the single entry both of them described. Two declaring one name with **different** `content:` halt the build under `TRANSLATION_ERROR`, naming the config and every contributing `(boundary, node)` tuple — a config entry always carries content, so keeping either declaration would discard a file an author wrote. Keep a config name distinct across every contributor at its assembly path, or make the declarations identical where two contributors are meant to deliver one shared file.
- **`networks:` from artifacts are NOT merged into the assembled compose file.** The compose provider derives networks from boundary annotations (one network per contributing boundary, named per [How a network name is derived](#how-a-network-name-is-derived)); artifact-supplied network declarations are silently dropped at the assembler boundary. Authors who need cross-network routing within a single compose file should use the `compose-bridge` Feature rather than authoring custom network entries via artifacts.
- **Any other top-level key from artifacts is dropped, and as silently as `networks:`.** `services:`, `volumes:` and `configs:` are the whole of what the assembler carries from a fragment. A `secrets:` block, a top-level `name:`, and an `x-`-prefixed extension key each reach the assembler and are each absent from the assembled file, with no warning and no halt — the build succeeds and the key is simply not there. Check the assembled `docker-compose.yaml` for anything you authored outside the three carried blocks rather than assuming it arrived.

The asymmetry between the first three and `networks:` is structural: `services:`, `volumes:` and `configs:` carry per-Recipe content the assembler accumulates into the assembled file; `networks:` is per-boundary infrastructure the assembler derives from boundary state. Artifacts can extend the former; only boundary annotations can shape the latter. Everything outside those four is a shape the assembled document has no place for, which is why it neither merges nor reports.

## What the compose provider does not deliver

- **Cross-network L4 routing within one compose file.** A service in network A reaching a service in network B by anything other than docker-compose's default DNS requires the `compose-bridge` Feature.
- **Cross-compose-file routing.** Boundaries that evaluate to distinct assembly paths produce distinct `docker-compose.yaml` files; the compose runtime treats them as independent projects. Cross-file communication is the operator's concern (publishing host ports, sharing external networks, or coalescing the boundaries onto one path via a shared `directory:`).
- **Sourcing an environment variable from an attachment.** Compose has no primitive for it, so a Workload `attachments` entry with `as: env` emits the variable name with an empty value rather than a runtime-resolved reference. The placeholder is deliberate — a variable that is present but empty is visible to whoever debugs the container, where an absent one leaves nothing to look at — and the build says so rather than leaving it to be discovered: each such entry raises an `unsupported-field` warning naming the entry at its authored coordinate (`containers.<name>.attachments.<KEY>`, or `initContainers[<i>].attachments.<KEY>`), so the author knows which variable arrives empty and which container it belongs to. The warning is advisory: the build succeeds, and the rendered file is byte-for-byte what it would be without it. `--no-unsupported-field-warnings` silences the class. An `attachments` entry with `as: file` is unaffected — compose bind-mounts it, and no warning is raised. The `compose-bridge` Feature is the future home for compose-side secret resolution.
- **Swarm-mode `deploy:` content.** Replicas, placement constraints, and update strategy under `deploy:` are swarm-mode features, and the compose provider targets single-host compose only, so it emits none of them. It does emit `deploy.resources` — the reservations and limits a container's `resources` map to, which docker compose honours in non-swarm mode (see [Container resources](#container-resources)).
- **Health-condition-gated `depends_on` from a `uses` edge.** A dependency derived from a `uses` edge is emitted ungated, with `service_started` semantics; it is not gated on the target's healthcheck reporting healthy. This is about what a `uses` edge means, not about a shape the provider cannot produce: the long form is emitted for an [init container](#init-containers) wait, and a [deployment wave](#deployment-wave-ordering) does gate on the target's health where the target declares a healthcheck.

## Authoring example

A two-service compose deployment with a depends_on edge derived from `uses`:

```yaml
# release.yaml fragment
spec:
  boundaries:
    production:
      annotations:
        aggrega.ai/namespace: prod
      components:
        api: {}
        db: {}
```

```yaml
# api Recipe
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: api
  version: 1.0.0
spec:
  capability: compose
  workload: |
    apiVersion: aggrega.ai/v1alpha1
    kind: Workload
    spec:
      containers:
        main:
          image: api:1.0
          ports:
            http: 8080
          health:
            live:
              http: /healthz
      services:
        public:
          type: NodePort
          ports:
            http: 8080
```

```yaml
# Aggregate fragment — api uses db
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
spec:
  components:
    api:
      uses:
        - target: db
    db: {}
```

The compose provider produces one `docker-compose.yaml` at the boundary's evaluated path (default `dist/production/compose/docker-compose.yaml` because `subDirectory:` defaults to `{{ .capability }}`) containing:

- `services.api` (the main api service, network `prod`, ports `8080:8080`, healthcheck via `curl`, `depends_on: [db]`)
- `services.db` (the main db service, network `prod`)
- `networks.prod` (the boundary's docker network)

## Related references

- [Workload entity](../entities/workload.md) — the platform-owned Workload kind that the compose provider translates.
- [Provider architecture](architecture.md) — how providers fit into the compilation pipeline.
- [Well-known annotations](well-known-annotations.md) — the `aggrega.ai/*` annotations the compose provider consumes.
- [Provider reference index](reference-matrix.md) — what each standard-library provider produces, and which page answers which question.
- [Recipe input composition](../../architecture/16-recipe-input-composition.md) — the canonical Provider Capability Matrix.
