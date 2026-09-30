# Component

The conceptual role of the Component entity (the abstract compute-node interface in Domain 2) lives in [architecture/04-entity-taxonomy.md](../../architecture/04-entity-taxonomy.md). This page covers the Component authoring surface: the Semantic Label Taxonomy that Architects use to layer cognitive identity on top of the operational base ontology, the `schema:` declaration for the data pillars, the `usesSchema` and `featuresSchema` declarative tables for topology sockets and attachment slots, presence mandates, the `extends:` inheritance mechanism, and the `assertions:` cross-field rule block.

## The Semantic Label Taxonomy (The Standard Library Convention)

If the base types are purely cloud-native, the operational and cognitive intelligence of the architecture is layered entirely through semantic duck-typing.

The core Go compiler does not read these labels. The compiler builds the flat Intermediate Representation (IR) graph without interpreting label semantics. These labels represent the **Standard Library Convention**—immutable "genetic markers" authored by the Platform Architect in Domain 2. They provide the explicit semantic hooks the Wasm policy validators and the physical Ops Recipes use to govern the architecture.

**(A) The Generic Cloud Layer**
These labels describe universal behaviors, allowing policy engines and generated L7 proxies to govern standard enterprise architectures without needing to natively understand AI frameworks.

| Label Prefix | Allowed Values (Convention) | Why Platform Ops needs it (The Policy Hook) |
| :--- | :--- | :--- |
| `api.aggrega.ai/protocol` | `http`, `grpc`, `tcp`, `udp` | Allows Ops rendering plugins (like an Istio recipe) to know if they should configure HTTP termination or just pass raw TCP packets. |
| `tool.aggrega.ai/impact` | `read-only`, `mutating` | Allows policy engines to evaluate Least-Privilege AuthZ. Mutating tools can automatically trigger policies that require strict approval-gate sidecars to be attached. |
| `datastore.aggrega.ai/engine` | `relational`, `document`, `kv`, `vector`, `graph`, `semantic-memory` (value set stabilizing against the populated catalog) | Allows policy engines to enforce cross-node type-safety (e.g., preventing an agent from attempting to send SQL payloads to a Vector DB). |
| `execution.aggrega.ai/pattern` | `sync`, `async`, `autonomous-loop` | Allows policies to distinguish between a standard background worker and a runaway AI agent, mandating strict Time-To-Live (TTL) timeouts for autonomous loops. |
| `gateway.aggrega.ai/intelligence` | `semantic`, `l4-mesh` | Dictates what features a router can physically support (e.g., preventing token-budget features on a standard TCP mesh). |
| `dataplane.aggrega.ai/request-mirroring` | `full-rate`, `sampled` | Lets a Feature that copies live traffic to a second destination select a proxy that can copy at all, and tell one that copies every matching request from one whose share of copied requests is settable. |
| `dataplane.aggrega.ai/caller-identity` | `client-certificate`, `injected-header` | Lets a Feature that needs the original caller identified to the service behind the proxy select a component that can convey that identity, and read *which* mechanism conveys it — the client's own TLS certificate details forwarded on, or a header the proxy composes itself after authenticating the caller. |
| `dataplane.aggrega.ai/content-masking` | `entity-recognition` | Lets a Feature that masks sensitive text select a component that can replace it with a placeholder in the chat and completion payload it routes, before the text travels further. `entity-recognition` names the fidelity: matches of patterns supplied in its configuration, and also entity types a recognizer service it calls detects. |
| `dataplane.aggrega.ai/log-masking` | `entity-recognition` | Lets a Feature that keeps sensitive text out of logs select a component that can replace it with a placeholder in the copy of a call it hands to its logs, while the request it forwards and the reply it returns stay as they were sent. `entity-recognition` names the fidelity: matches of patterns supplied in its configuration, and also entity types a recognizer service it calls detects. |
| `dataplane.aggrega.ai/prompt-guard` | `pattern-list` | Lets a Feature that screens model prompts select a component that can inspect the chat and completion payload it routes and refuse a request on its content. `pattern-list` names the fidelity: the match is against patterns supplied in its configuration, over the model payload and not an arbitrary HTTP body. |
| `dataplane.aggrega.ai/upstream-tls` | `trust-anchor` | Lets a Feature that requires the proxy to check who it is talking to select a component able to verify an upstream's certificate against a trust anchor the Release supplies. |
| `dataplane.aggrega.ai/upstream-pinning` | `public-key` | Lets a Feature that pins which key an upstream may present select a component able to refuse an upstream unless a certificate it presents carries one of the public keys the Release supplies. A different assertion from `upstream-tls`: a pin says which key a certificate must be, an anchor what it must say. |

The `dataplane.aggrega.ai/` keys name a position on the traffic path rather than a
kind of component, so a proxy, an ingress gateway and a service mesh all describe
themselves in one vocabulary instead of each needing its own. Two properties of the
family are worth reading carefully, because both are easy to invert:

- **The value carries the fidelity, not just the presence of the capability.** Two
  components can both mirror requests and still differ in a way a Feature cares about,
  so the distinction rides in the value and a Feature selects the fidelity it needs.
  A component that offers a stronger fidelity carries the stronger value and no other.
- **A value asserts what the product is able to do, never what a deployment has
  switched on.** The two read alike and only the first is a property of the
  component. A proxy that can verify an upstream certificate carries
  `upstream-tls: trust-anchor` whether or not any given deployment enables the
  check, because the label is what a Feature selects on before anything is
  configured.

A component with nothing to describe on one of these axes carries no value there
rather than a weakest one, exactly as elsewhere in the taxonomy: absence means the
axis has no subject on that component, so a Feature requiring any value on it
correctly does not attach.

**(B) The Specialized AI Layer (The Cognitive Identity)**
These labels describe the *cognitive* identity of the workload, allowing the architecture to secure modern AI frameworks.

| Label Prefix | Allowed Values (Convention) | Why Platform Ops needs it (The Policy Hook) |
| :--- | :--- | :--- |
| `model.aggrega.ai/capability` | `generative`, `embedding`, `transcription` | Used by the `usesSchema` selector strings (evaluated natively by the Go compiler during static analysis) to guarantee a developer doesn't accidentally route a generative text payload to an embedding endpoint. |
| `agent.aggrega.ai/autonomy` | `autonomous`, `copilot` | Identifies the execution risk of the cognitive loop, allowing policies to mandate human-approval features for fully autonomous agents. |

**(C) The Cross-Cutters (Governance, State, & Hardware)**
These represent the foundational enterprise tags that drive Zero-Trust validation and hardware routing.

| Label Prefix | Allowed Values (Convention) | Why Platform Ops needs it (The Policy Hook) |
| :--- | :--- | :--- |
| `component.aggrega.ai/hosting` | `self-hosted`, `managed`, `external` | Records who operates a component's underlying resource — the trust-boundary axis. Policy engines read it to calculate Data Exfiltration risk (e.g., internal data routed to a `managed` third-party API leaves the operator's boundary). Cross-cutting: the same values describe a managed database, a managed model API, and a self-run inference server alike. |
| `compliance.aggrega.ai/data-class` | `public`, `internal`, `restricted` | Tracked topologically by the policy engine. If a continuous path exists from a `public` node to a `restricted` database without the Features the policy requires attached along it, the policy halts the build. |
| `compliance.aggrega.ai/contains-pii` | `true`, `false` | Explicitly flags workloads for GDPR/CCPA. Policy engines use this to mandate the attachment of specific Features on the path such a workload's traffic takes — `core/data-masking` on an AI gateway it sends model traffic through, for instance. |
| `hardware.aggrega.ai/accelerator` | `gpu`, `tpu`, `npu` | Used by DevOps in the `Release` file. They explicitly route these components into physical hardware pool boundaries (e.g., a GPU-capable cluster) via the `components: {}` map, while a governance verdict role can enforce that GPU-labeled components are never placed in non-GPU boundaries. |
| `state.aggrega.ai/retention` | `retain`, `delete` | **Solves the AOT Deletion Blind Spot.** If a developer deletes a database from their `Aggregate`, a GitOps orchestrator will physically drop the disk. A governance `label-transform` plugin can read the `retain` label and automatically mutate the output artifacts to include orchestrator-native protection (e.g., `helm.sh/resource-policy: keep`). |
| `state.aggrega.ai/backup-tier` | `mission-critical`, `standard`, `ephemeral` | **SOC2 Availability Hook.** Tells the Ops `FeatureRecipe` whether to physically generate automated Snapshot/Volume Backup configurations for the resource. |

**(D) The Dynamic Business Context (Cascading Annotations)**
While `labels` define the immutable Catalog DNA, dynamic business contexts (like SOC2 audit scoping or FinOps cost tracking) change depending on who deploys the application and where it runs. These are governed by **Annotations** injected dynamically by the Developer's `subsystems`, the Ops `Release` boundaries, or the governance `label-transform` auto-tagger.

| Annotation Prefix | Allowed Values (Convention) | Why Platform Ops needs it (The Policy Hook) |
| :--- | :--- | :--- |
| `business.aggrega.ai/cost-center` | e.g., `finance`, `ai-research` | Required by Wasm rendering plugins to inject physical tagging (e.g., AWS tags or K8s labels) into the final generated artifacts for cloud billing dashboards. |
| `business.aggrega.ai/owner` | e.g., `team-alpha@corp.com` | Incident Response routing. Guarantees the infrastructure is mapped to a human team. |
| `compliance.aggrega.ai/frameworks` | e.g., `soc2, hipaa` | **SOC2 Scope Trigger.** Injected via the environment `Release`. Wasm plugins read this string to automatically generate rigid audit-logging sidecars and disable debug ports when an application enters a production compliance boundary. |

*The taxonomy is a catalog convention, not a compiler rule. Enterprises can ignore it, delete it, or invent their own label vocabulary (`mycompany.com/custom-trait`). Wasm plugins evaluate whatever label keys the enterprise authors.*

## Schema Authoring

The `Component` schema (and its `Feature` counterpart, including credential Features labeled `feature.aggrega.ai/kind: secret`) declares the validation contract for developer-authored `values` through a `spec.schema:` block. The block accepts JSON Schema 2020-12 expressed either in the compact-form YAML shorthand (the default; about 15 keywords, mechanically transformed to JSON Schema at compile time) or in full JSON Schema YAML (the verbose form), with cross-document references via `$ref:` for SchemaLibrary entries shared across multiple Components.

* **Inline compact form (default authoring surface):** an embedded YAML block carrying compact-form leaves directly in the Component YAML. Fits the large majority of catalog schema content in a fraction of the line count of full JSON Schema. See [`vocabulary/compact-form-authoring.md`](../vocabulary/compact-form-authoring.md) for the keyword vocabulary and authoring conventions.
* **Inline JSON Schema YAML:** the verbose form, suitable when the schema needs JSON Schema 2020-12 keywords the compact form does not carry directly (`$dynamicRef`, deep `unevaluatedProperties`, complex `not:` composition). Compact form and JSON Schema can be mixed at any node boundary within a single `schema:` block via the `$jsonschema:` escape hatch.
* **Cross-document reference (`$ref:` to a SchemaLibrary entry):** a JSON Schema-native `$ref:` pointing at a SchemaLibrary entry by identity (`Datastores#/schemas/MariaDBValues` or similar). Enterprise schemas spanning hundreds of lines and reused across multiple Components live in SchemaLibrary entities; the consumer Component references the entry without inlining the content. See [`entities/schemalibrary.md`](schemalibrary.md) and [`vocabulary/cross-document-ref.md`](../vocabulary/cross-document-ref.md) for the library entity and the resolution semantics.

The three forms above author pillar content, and they are available to a Component that extends nothing. A Component that declares `extends:` authors no pillar content at all: it writes the literal marker `schema: inherited` and receives its base's pillar block exactly as the base authored it. That marker is the only value `schema:` takes on such a Component. See "Catalog Authoring: Extending Base Components" below.

The compiler resolves the `schema:` block — expanding compact form, dereferencing `$ref:` URLs, applying SchemaLibrary library-to-library chains — and unifies the resulting JSON Schema with the auto-generated bases derived from `usesSchema` and `featuresSchema` (see the section below) during the Component's validation pass. Validation runs against the resolved schema; the authoring path is opaque to downstream pipeline stages.

Authored instances are validated against this resolved schema at build time: a component instance's developer-authored `values` and the Operator's resolved `infra`, plus the `values`/`infra` on any Feature attachment, must conform to the declared pillars — a wrong-typed value, an out-of-range number, a string that does not have its declared `format`, a missing required field, or (for `values`, validated closed) an undeclared property halts the build at its authored source rather than producing a broken manifest at deploy time. A pillar whose schema names a `format` the compiler does not check — anything outside `email`, `uri`, `hostname`, `ipv4`, `ipv6`, `uuid`, `date-time` and `date`, `password` included — is refused when the catalog loads, listing the supported names; see [`vocabulary/compact-form-authoring.md`](../vocabulary/compact-form-authoring.md#named-formats) for what each name checks. An instance of a Component that `extends:` a base is validated against the base's pillar block, which the extending Component inherits unchanged — so an instance of the base and an instance of anything extending it face the same pillar contract. See [errors/fatal-halts.md](../errors/fatal-halts.md) §"Authored values or infra do not conform to the declared schema" for the diagnostics and the per-pillar rules (including how `infra` is validated against the Component-plus-provider key union).

**Declared defaults materialize into the rendered pillars.** Beyond validation, a `default:` declared on a `values` field (or an `infra` field) is filled into the rendered pillar at build time for every key the author omits — so a Recipe template reading `{{ .values.charset }}` receives the schema-declared `utf8mb4` rather than an empty value. Author-supplied values always win; nested objects fill per omitted child. Because materialization uses the same schema resolution as validation, defaults reached through a cross-document `$ref:` into a SchemaLibrary materialize too — both a whole-pillar reference (`values: {$ref: "BaseComponents#/schemas/BaseModelParameter"}`) and the base-plus-flavor shape (a base `$ref:` alongside sibling `properties`, each carrying its own defaults). Defaults declared only inside a local in-document `#/$defs/` reference, or under an `allOf` / `oneOf` / `anyOf` branch, are not materialized; the standard library composes pillars via cross-document `$ref:`, which is.

## The `values` Pillar

The Component schema separates three pillars by ownership: `values` is filled by the Developer in the Aggregate (cognitive intent — database name, version, charset), `infra` is filled by the Operator in the Release (operational sizing — compute, storage, HA, backup), and `provides` is set by the Recipe (the public API contract — host, port, protocol). The Developer never sees `infra`; the Operator never sees `values`. Recipes consume both pillars during base rendering, mapping the abstract pillars into the concrete shape their target provider expects. This section covers the `values` pillar's authoring surface. See [`vocabulary/data-pillars.md`](../vocabulary/data-pillars.md) for the broader pillar taxonomy and the cross-pillar cascade discipline.

`values` carries the **Developer's cognitive intent** — the choices that describe what the application is or does, not how it sizes or runs. Database name, charset, engine version, log level, feature flags, application-tier knobs that change between application versions but stay stable across environments are typical `values` content. The Operator never overrides `values:` (the Release schema mechanically rejects a `values:` block per [architecture/06-data-taxonomy-and-composition.md §8 Constraint 4](../../architecture/06-data-taxonomy-and-composition.md)); per-environment variation flows through Parameter Hoisting — the Aggregate exposes typed `parameters.*`, the Component's `values` template references them, and the Release fulfills the parameters.

```yaml
# Component schema declares the values shape:
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: core/datastore/mariadb
spec:
  schema:
    values:
      database_name: { type: string, required: true }
      charset: { type: string, default: utf8mb4, enum: [utf8mb4, latin1, ascii] }
      engine_version: { type: string, default: "10.11" }
      log_level: { type: string, default: info, enum: [debug, info, warn, error] }
```

```yaml
# Aggregate fragment — the developer fills values:
components:
  customer-db:
    type: core/datastore/mariadb
    values:
      database_name: customers
      charset: utf8mb4
      engine_version: "{{ .parameters.mariadb_version }}"   # Parameter Hoisting
      log_level: info
```

**Recipe-side consumption.** Recipes read the resolved values via `.values.<field>` in `valuesMapping:`, `provides:`, `assertions:`, and the other template surfaces — see [entities/recipe.md](recipe.md) for the per-template availability matrix. The compiler unifies the Component's `values` schema with any Feature-attachment `values:` schemas at the same Component node so the resolved template context carries every applicable field.

**Cross-pillar discipline.** `values` is the only pillar the Developer authors at the Aggregate. Strictly developer-facing fields belong here; operational knobs (replica counts, CPU/memory bounds) belong on the Component's `infra` pillar so they live in the Release; public output (host, port) belongs on the Recipe's `provides`. Mixing these breaks the ownership invariant; see [vocabulary/data-pillars.md](../vocabulary/data-pillars.md) "Cross-pillar mechanics" for the rare cases where deliberate cross-pillar piping is justified.

## The `infra` Pillar

The Component schema separates three pillars by ownership: `values` is filled by the Developer in the Aggregate (cognitive intent — database name, version, charset), `infra` is filled by the Operator in the Release (operational sizing — compute, storage, HA, backup), and `provides` is set by the Recipe (the public API contract — host, port, protocol). The Developer never sees `infra`; the Operator never sees `values`. Recipes consume both during base rendering, mapping the abstract pillars into the concrete shape their target provider expects.

Three `infra` conventions matter across every capability-agnostic Component in the standard library: an open-struct escape hatch for provider-specific knobs, an optional override for the upstream artifact version, and an intent-based vocabulary for high-availability fields. The canonical reference Component is `core/datastore/mariadb` in the standard-library catalog — implementable by Helm Recipes against the Bitnami chart, Terraform Recipes against AWS RDS, CloudFormation Recipes against the same RDS surface, and Compose Recipes against a local container — and its `infra` block illustrates all three patterns.

### `infra.overrides`

Universal `infra` fields — `compute`, `storage`, `ha`, `backup` — cover most operational sizing across providers. The remaining slice is irreducibly provider-specific: a Kubernetes Recipe needs a `nodeSelector`, an RDS Terraform Recipe needs an `instance_class`, a CloudFormation RDS Recipe needs a `DBInstanceClass`, a Compose Recipe needs an `image` override. The Component schema exposes a genuinely-open map as the escape hatch so these knobs flow through without bloating the schema:

```yaml
infra:
  # ... universal fields ...

  # Provider-specific overrides. Accepts any nested structure.
  # Each Recipe documents which keys it reads.
  overrides:
    type: object
    additionalProperties: true   # genuinely open map: arbitrary nested structure permitted
```

The explicit `type: object` with `additionalProperties: true` opts into the open-map semantic. The compiler pipes the structure through untouched; the Recipe's template body reads whichever keys it knows about and ignores the rest. Each Recipe documents the override-key ontology in its header comment, so an Operator authoring a Release for a specific Component × Recipe combination knows what knobs the Recipe exposes.

A Release fragment using overrides:

```yaml
components:
  main-db:
    infra:
      compute: { cpu: "2", memory: 8Gi }
      storage: { size: 40Gi, type: balanced-csi }
      overrides:
        nodeSelector:
          kubernetes.io/hostname: cluster1-worker1
        service_type: LoadBalancer
        metrics:
          enabled: true
          image:
            repository: bitnamilegacy/mysqld-exporter
```

The Developer never sees `overrides` — it lives in the Release, which is the Operator's domain.

### `infra.source_version`

A Recipe's `source` field references an upstream artifact at a specific version (Helm chart 25.0.8, Terraform module 4.2.0, OCI image tag). Hardcoding the version inside the Recipe forces the catalog maintainer to publish a new Recipe on every compatible upstream version bump. The Component schema exposes an optional override:

```yaml
infra:
  source_version:
    type: string
    description: |
      Source artifact version. A Recipe versions its artifact from this key
      where its source resolution reads it, and is unaffected where it does not.
      Changing from the version a Recipe was authored against does not
      guarantee value mapping compatibility.
```

The Recipe reads this through the `optional` helper in its `source` block, so an
absent pin falls through to the version the Recipe was authored against:

```yaml
source:
  # Planned: provider-declared source keys, validated by the provider's Wasm plugin.
  # The built-in resolver today uses the { kind, url, version } form.
  registry: oci://registry-1.docker.io/bitnamicharts
  chart: mariadb
  version: "{{ optional .infra `source_version` `25.0.8` }}"
```

Recipe `source` strings (and string-valued sub-fields of a structured `source:` map) are evaluated as Go templates against the same self-contained context as Recipe `locals` — `.context.instance_id`, `.values`, `.infra`, and the node's whole resolved `.locals` — with `.context.inject`, `.context.uses` and `.provides` all forbidden. `.infra` being on that context is what makes the override above work, and `.locals` lets a Recipe compute a source fragment once and read it back here. A source template never reads its own node's provides: that pillar is not part of the context, and a template reaching for it halts the build — a fixed property of the surface rather than a gap awaiting later work. See [Template Expansion Matrix row #5](../templates/expansion-matrix.md) for the full availability rules. Changing `infra.source_version` away from the Recipe's default does not guarantee that the Recipe's `valuesMapping` is wire-compatible with the new upstream version; the inline comment on the Component schema's `source_version` declaration carries that warning.

### `infra.ha.*`

High-availability fields use intent vocabulary, not mechanism vocabulary:

```yaml
infra:
  ha:
    enabled: { type: boolean, default: false }
    read_replicas: { type: integer, min: 0, default: 0 }
```

`infra.ha.enabled` says "make this Component highly available," and `infra.ha.read_replicas` says "I want N read-only copies." Each Recipe maps the intent into its provider's mechanism:

| Recipe's provider | `ha.enabled: true` maps to | `ha.read_replicas: N` maps to |
| :--- | :--- | :--- |
| Helm (Bitnami MariaDB chart) | activates the `secondary` StatefulSet block | sets `secondary.replicaCount` |
| Terraform (AWS RDS) | sets `multi_az = true` on the primary `aws_db_instance` | creates N separate `aws_db_instance` read-replica resources |
| CloudFormation (AWS RDS) | sets `MultiAZ: true` on the `AWS::RDS::DBInstance` | creates N separate `AWS::RDS::DBInstance` replica resources |
| Compose (local dev container) | ignored — no HA mechanism at this layer | ignored — no replica mechanism at this layer |

Mechanism vocabulary (`infra.primary.replicas`) reads naturally for one provider (Kubernetes pods are replicas of a StatefulSet) and as a category error elsewhere — RDS has no "replicas" concept on the primary, CloudFormation mirrors RDS, Compose has no horizontal-replica abstraction at all. Intent vocabulary translates: every provider has some concept of "make this database highly available" and some concept of "I want N read-only copies," and the Recipe carries the per-provider translation. A provider whose target lacks an HA equivalent (Compose) treats `ha.*` as advisory.

`infra.ha.read_replicas: 0` is the default; the K8s Recipe handles it explicitly with a `replicaCount: 0` branch on the secondary StatefulSet block rather than generating zero-pod resources. Operators choosing a provider whose target lacks HA accept that `ha.*` settings on the Release have no effect for that boundary.

## The `provides` Pillar

`provides` is the **Recipe-authored public API** — the values a Component's resolved Recipe contributes to downstream callers via their `.context.uses.<alias>.provides.<provided-name>` surface (or, when the caller declares an `inject:` allowlist on the edge, via its `.context.inject` pipe). The Component schema declares the shape (key names plus types); the bound Recipe's `provides:` block supplies the values. The Developer authoring an Aggregate sees the `provides` shape on the Component page as the contract callers can rely on; the Recipe author fulfills the contract for the specific implementation they wrap.

Fulfillment is enforced as a Loud Guardrail: a bound Recipe must produce every `provides` key its Component declares. If the bound Recipe omits a declared key, the build halts and names the missing key, rather than silently delivering nothing to the callers that reference it. Producing extra keys beyond the declared set is allowed. Only key presence is checked — the produced values are opaque strings the compiler pipes through, so their declared types remain a contract callers read, not a value the compiler validates.

```yaml
# Component schema declares the provides contract:
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: core/datastore/mariadb
spec:
  schema:
    values:
      database_name: { type: string, required: true }
    provides:
      host: { type: string }
      port: { type: integer }
      database: { type: string }
```

```yaml
# Recipe fulfills the contract:
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: mariadb-bitnami
spec:
  capability: helm
  implements: core/datastore/mariadb:1.0.0
  provides:
    host: "{{ .context.instance_id }}-mariadb.{{ .context.annotations.release.\"aggrega.ai/namespace\" }}.svc.cluster.local"
    port: "3306"
    database: "{{ .values.database_name }}"
```

**The provides-then-inject evaluation split.** The compiler evaluates `provides:` templates at provides evaluation against the self-contained template context (`.context.instance_id`, `.values`, `.infra`, and the Recipe's resolved `locals:` on the same node) — no caller state is visible. The node's locals resolve in that stage's preamble, ahead of its provides, which is what lets a `provides:` template read `.locals`. At inject hydration, which runs next, the compiler walks `uses:` edges and resolves each caller's `.context.uses.<alias>.provides.<provided-name>` against the resolved provides values. Splitting the two guarantees acyclic resolution: `provides:` cannot reference a caller, and a caller's `inject:` cannot reference a not-yet-resolved provider's output until inject hydration runs.

**Contract evolution.** Renaming or removing a `provides` field is a breaking change for every caller relying on the old name. The Component's `implements:` interface version (and the Recipe's `implements:` declaration) carries the contract evolution signal; downstream callers pinned to a specific major version see a stable `provides` shape.

**Recipe-side teaching.** For the `provides:` template authoring grammar, the per-template availability matrix, and worked examples of cross-namespace and cross-region routing, see [entities/recipe.md](recipe.md) "The `provides:` block" and [architecture/06-data-taxonomy-and-composition.md §3](../../architecture/06-data-taxonomy-and-composition.md).

## Presence mandates: `features.aggrega.ai/requiredType.<label>`

A Component may declare that every instance of it **must** carry an attachment of a given Feature type. This is a **presence mandate**, and it is authored as a repeatable annotation on the Component's own metadata:

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: core/payment-processor
  version: 1.0.0
  labels:
    component.aggrega.ai/type: server
  annotations:
    features.aggrega.ai/requiredType.audit: core/audit-logging
    features.aggrega.ai/requiredType.compliance: core/pci-compliance
spec:
  schema:
    values:
      processor_endpoint: { type: string, required: true }
```

The key is the prefix `features.aggrega.ai/requiredType.` followed by a label you choose; the value is the Feature type URI at least one attachment must carry. The label names the requirement in the diagnostic an unmet mandate produces — `audit` and `compliance` above — and that is its whole job. Labelled keys are how a Component declares more than one mandate at once: annotations are a flat string map and cannot carry a duplicate key.

The compiler evaluates each mandate against the instance's **final** attachment set, after the 5-Tier Onion Model cascade has folded every scope: the Aggregate's component-level and subsystem-level `features:` blocks, the Release's boundary-level and component-level `features:` blocks, and attachments produced by annotation-driven expansion. Any of them satisfies the mandate — the rule tests what is present, never how it got there. So a Component whose mandate is met only because an operator set a monitoring annotation in the Release passes exactly as one whose developer attached the Feature by hand.

A mandate that no attachment satisfies halts the build with a diagnostic naming the component instance, the requirement's label, and the required type. An annotation value is an opaque string, so nothing validates its shape before the compiler reads it; a value that is not a Feature type URI, or a key with no label after the prefix, therefore halts with a **separate** diagnostic saying the declaration is malformed. The two are deliberately distinct: a broken declaration is corrected in the catalog entity, while an unmet requirement is resolved by attaching the Feature — and a typo must never read as a satisfied requirement.

Both diagnostics are documented at [`errors/fatal-halts.md`](../errors/fatal-halts.md) "Required feature not attached".

**A mandate is not a slot.** The two surfaces answer different questions and the difference is not cosmetic:

| | `featuresSchema` slot | presence mandate |
|---|---|---|
| Declares | a named binding point | a constraint on what must be present |
| Name is dereferenceable | yes — `from: <slot>` and `.features.<slot>.provides.*` | no — the label names the requirement, nothing else |
| Cardinality | exactly one fill per slot | at least one attachment of the type |
| Constrains the fill | `selector`, `inject`, `sensitive` | nothing beyond the type |
| Satisfied by a free attachment | no — a slot is filled by name | yes — at any scope, under any name |
| When the demand is unmet | halts when `required: true` and nothing binds the slot's name | halts when no attachment carries the type |

Both demands are checked against the same input — the instance's final attachment set — and both halt with their own diagnostic, because they ask different questions of it: whether one named binding point is bound, versus whether some attachment carries a named type. Neither answers for the other.

Reach for a slot when the Recipe needs to *read* what was attached. Reach for a mandate when the Component's contract demands a capability be present and does not care which instance supplies it. A payment-processing Component that mandates `core/audit-logging` gets audit logging in every deployment whether or not the developer remembered to attach it; a PCI-compliant Component that mandates `core/pci-compliance` cannot ship without the compliance Feature attached somewhere in the deployment.

**Inheritance.** A mandate declared on a base Component is inherited by every Component that `extends:` it, because metadata annotations merge along the extends chain with the child winning per key. A child may therefore retarget an inherited mandate by re-declaring the same label with a different type, or add mandates of its own under new labels; it cannot drop one the base declared.

## Topology Sockets: `usesSchema`

A Component may declare topological sockets through a `usesSchema:` block — a declarative YAML map parallel to `featuresSchema`. Each entry names a socket the Component accepts cross-component dependencies through and governs which Component shapes the developer may wire into the socket. The compiler auto-generates JSON Schema 2020-12 validation rules from the declared sockets and unifies them with the Component's `schema:` during Component resolution; developers do not hand-author a `uses:` pillar inside `schema:`, because the structure comes from `usesSchema`.

```yaml
# Component declares the sockets it accepts:
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: core/ai-agent/orchestrator
spec:
  usesSchema:
    primary_datastore:
      required: true
      selector: "datastore.aggrega.ai/engine=vector"
      inject: [env]
    cache:
      required: false
      selector: "datastore.aggrega.ai/engine=kv"
      inject: [env, file]
    log_destination:
      required: false
      selector: "component.aggrega.ai/category=messaging"
      inject: []
```

```yaml
# Aggregate fragment — developer wires the sockets:
components:
  agent:
    type: core/ai-agent/orchestrator
    uses:
      primary_datastore:
        main:  { target: vector-db-instance }
      log_destination:
        audit: { target: audit-sink }
```

**Wiring forms — a socket accepts one or many targets.** The examples above wire each socket to a single target, but a socket may fan out to several. A socket value is authored in one of two forms:

```yaml
uses:
  # Compact form — a list of target names. Each entry produces an edge
  # whose alias equals its target. Use it for the single-target case, and
  # when one socket connects to several peers of the same shape.
  shards: [orders-db, customers-db, inventory-db]

  # Verbose form — an alias-keyed map. Each alias maps to an entry object
  # carrying its own `target:`, and may carry its own inject directives.
  # Use when the connections need distinct names or per-edge inject.
  databases:
    primary: { target: orders-db,    inject: { env: [{ in: DB_URL, from: url }] } }
    replica: { target: orders-db-ro, inject: { env: [{ in: DB_URL, from: url }] } }
```

An alias always maps to an entry object, never to a bare target name: `databases: { primary: orders-db }` is rejected at load, and so is an entry object that omits `target:`. To wire a single target with no alias to invent, reach for the compact form — `primary_datastore: [vector-db-instance]` — which names the target once and derives the alias from it.

Each entry — list element or map alias — becomes one edge, preserved in authoring order. The socket's `selector:` applies to every target wired through it (each edge is type-checked independently during static analysis), and `required: true` means at least one target must be wired.

**Field semantics:**

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `required` | bool | `false` | When `true`, the developer must wire at least one dependency into this socket. When `false`, the socket is optional. |
| `selector` | string | — | A label selector, in the grammar Feature `appliesTo` uses, that the target of every edge wired through this socket must satisfy. It is read as the string written here and evaluated against the target's labels during static analysis: a target whose labels do not satisfy it halts the build, and so does a selector the grammar refuses, naming the requirement it could not read. An empty selector places no constraint on the target. |
| `inject` | string[] | — | Allowlist of allowed inject delivery mechanisms (parallel to `featuresSchema[].inject`). Absent, or `[]` (empty), means blackbox — no `inject:` block allowed on the developer's `uses:` entry; the Recipe controls delivery. `[env, file, arg]` (non-empty) means transparent — the developer may dictate which mechanism delivers the dependency's `provides` values. Enforced: see "Where a socket's `inject` allowlist is enforced" below. |
| `valueSchema` | object | — | Optional per-edge contract for developer-authored `values` on an edge wired through this socket (authored in the Aggregate). JSON Schema 2020-12 in the same authoring forms as `schema:`. Omission means the socket declares no `values` contract. |
| `infraSchema` | object | — | Optional per-edge contract for operator-authored `infra` on an edge wired through this socket (authored in the Release). Same authoring forms as `valueSchema`. Omission means the socket declares no `infra` contract. |
| `description` | string | — | Human documentation, rendered by IDE and hub. |

**Where a socket's `inject` allowlist is enforced.** The allowlist is the socket's statement of whether a consumer may choose the delivery form at all, and if so which forms — so it is checked against every `uses:` edge wired through the socket, once the edge and the socket's declaration are both in hand. Two refusals follow from one rule, and both halt the build:

* An edge dictating a mechanism the allowlist does not list halts, naming the socket, the offending mechanism, and what the socket does permit. Every offending mechanism on the edge is reported together.
* An edge dictating **any** delivery through a socket whose allowlist is absent or empty halts too. That is the blackbox declaration doing its job: it says "the Recipe delivers this internally; do not dictate delivery," and an empty allowlist permits none rather than permitting all.

The socket is read on whichever entity **declared** it, which is not always the component the edge hangs off: an edge authored on a Feature attachment's `uses:` resolves against the attached Feature's `usesSchema`, and every other edge — authored in the Aggregate, wired from the Release, or reached through a sub-aggregate — against the consuming Component's. A socket inherited through `extends` is read exactly as one the entity authored itself.

An edge that dictates nothing is unaffected by either refusal, whatever the socket declares: reading a dependency's values from `.context.uses.<alias>.provides.<name>` in the consuming Recipe needs no `inject:` block and is always available. See [errors/fatal-halts.md](../errors/fatal-halts.md) for both diagnostics.

**Per-edge connection contracts — `valueSchema` and `infraSchema`.** Beyond governing *which* Components may wire into a socket, a socket may declare *what configuration each connection carries*. Two optional per-socket schemas validate connection-scoped config on every edge wired through the socket:

* `valueSchema` is the contract for the developer-authored `values` block on a `uses` edge — per-connection tuning the developer expresses in the Aggregate (for example, a connection pool size or a client mode).
* `infraSchema` is the contract for the operator-authored `infra` block on a `uses` edge — per-connection operational sizing the operator expresses in the Release.

Both accept JSON Schema 2020-12 in the same content-shape forms as the `schema:` field — inline compact form, inline JSON Schema YAML, or a cross-document `$ref:` into a SchemaLibrary entry. They are **per-edge** contracts validated against each edge's config independently; they are not composed into the consuming Component's own `values` schema. A socket that omits a per-edge schema for a pillar declares no contract there, and any config authored for that pillar is unvalidated. Per-edge config is validated closed, and validation is default-aware in both pillars: a key the schema gives a `default:` counts as supplied even when the author omits it.

A declared `default:` also **materialises**, in both pillars. A key the author omits reaches the consuming Recipe's render context carrying its declared default, exactly as an omitted component `value` or `infra` key does — so declaring the default on the socket is enough, and the Recipe template needs no fallback expression for it. An authored value always wins over the declared default, and it fills only the key it supplies: an edge that authors one key of a socket's contract still receives the declared defaults for that contract's other keys. Defaults attach to edges, so a socket left unwired contributes nothing.

```yaml
spec:
  usesSchema:
    databases:
      required: true
      selector: "datastore.aggrega.ai/engine=relational"
      inject: [env]
      valueSchema:                       # developer per-edge values, authored in the Aggregate
        pool_size: { type: integer, minimum: 1, maximum: 100, default: 10 }
        tls_mode:  { type: string, enum: [disable, require, verify-full], default: require }
      infraSchema:                       # operator per-edge infra, authored in the Release
        storage_class: { type: string, default: standard }
```

With that socket declared, an edge whose Aggregate omits `pool_size` renders `10`, and an edge whose Release omits `storage_class` renders `standard`. Authoring wins per key, within its own pillar: an Aggregate that sets `pool_size: 42` renders `42` while `tls_mode` still fills to `require`, and a Release that sets `storage_class: gp3` renders `gp3` without disturbing either developer key.

A Recipe for the consuming Component reads the resolved per-edge config from the enriched topology pipe at `.context.uses.<alias>.values.<key>` and `.context.uses.<alias>.infra.<key>` — see [`vocabulary/topology-triad.md`](../vocabulary/topology-triad.md).

**Schema generation from `usesSchema`.** The compiler generates a base JSON Schema 2020-12 fragment from the declared sockets and composes it with the user's `schema:` declaration — the same pattern `featuresSchema` uses. The generated schema never touches disk; it exists only in memory during the Component validation pass. The developer's `uses:` map in the Aggregate validates against the merged schema; the per-socket `selector:` evaluates against candidate Component labels during static analysis as the cross-node type-safety check.

**Selector semantics — the Split Schema mechanism.** `usesSchema[].selector:` is what makes Aggrega's topology more than untyped string-passing. A socket declaring `selector: "datastore.aggrega.ai/engine=vector"` only accepts wiring to Components labeled with the matching key-value pair; an agent attempting to wire its `primary_datastore` socket to a `relational` Component fails the Static Analyzer with a clear selector-violation diagnostic. The selector is a Kubernetes-style label-selector string — comma-AND requirements over `=`, `!=`, `in (...)`, `notin (...)`, bare-key, and `!key` forms — the same grammar Feature `appliesTo` uses; see [vocabulary/modifier-system.md](../vocabulary/modifier-system.md) for the grammar and [architecture/13-catalog-and-registry.md §2 "Kubernetes-Style Selectors"](../../architecture/13-catalog-and-registry.md) for the engine semantics. A requirement outside those forms is refused rather than read as some other selector: an empty requirement (a leading, trailing or doubled comma), a key carrying whitespace or any of `=`, `!`, `(`, `)` and the comma, or a set without its closing parenthesis halts every build that wires an edge through the socket, naming the requirement. So a socket meant to exclude frontends is written `selector: "tier!=frontend"`; `"!tier=frontend"` is refused, because `!` names a label key and nothing else.

**Ad-hoc sockets — what declaring a socket buys, and what an author may do without it.** An Aggregate author may write a `uses:` entry on their own component under a socket name this `usesSchema` does not declare, including on a Component that declares no `usesSchema` at all. The edge is built. Catalog silence about a socket means the connection was not anticipated, not that it is forbidden, and the developer owns the application's topology.

What such an **ad-hoc** socket gives up is precisely what a declared one provides, because all of it lives in the `usesSchema` entry: no `selector`, so nothing constrains which component the edge may reach and the cross-node type-safety check has nothing to evaluate; no `inject:` allowlist; no per-edge `valueSchema`, so per-edge `values:` has no contract to be checked against and no declared defaults to inherit. It gives up `infraSchema` too, though nothing reaches that contract on such a socket either way: per-edge `infra` is authored on a Release edge entry, and a Release entry may only name a socket the consuming Component declares. What is unchanged is what the edge may *carry*: every `inject` entry's `from:` must still name a key the target Component's `schema.provides` declares, and the target must still exist — both halt the build as they do on a declared socket.

Read "no `inject:` allowlist" as the absence of a constraint rather than as a blackbox declaration, because the two look alike and behave oppositely. An edge through an ad-hoc socket may dictate delivery freely: there is no allowlist for a mechanism to be outside of, and no entity promised to handle the values internally. The blackbox refusal above applies to a socket the entity **did** declare and left without an `inject:` allowlist — that omission is a statement about a connection the entity anticipated, and an ad-hoc socket makes no such statement.

**Delivery is the same path, and the rendered artifact records no difference.** An ad-hoc edge's `inject` block is resolved and delivered exactly as a declared socket's: each `from:` key is read off the target's evaluated `provides` and lands on the consuming node's injection context under the delivery key the author chose, reaching the rendered artifact from there. There is one delivery path and nothing on it branches on whether the socket was declared. What a declared socket can add is *content* — per-edge defaults its `valueSchema` or `infraSchema` fills in — so where a declared socket carries no such contract, the same edge renders identically under either kind of socket. The declaration is a fact about the connection, not an input to what is rendered.

Per-edge `values:` on an ad-hoc socket is accepted and reaches the consuming Recipe at `.context.uses.<alias>.values`, **unvalidated**: with no `valueSchema` to measure it against, no key is checked and none is rejected. That is not peculiar to ad-hoc sockets — a declared socket that authors no contract for the pillar treats its per-edge config the same way. What an ad-hoc socket changes is that the contract cannot be added without declaring the socket. `.context.uses.<alias>.infra` is empty on such an edge, because the surface that supplies per-edge infra cannot name an undeclared socket.

Every edge in the emitted graph records which of the two it is, so a consumer never has to infer it, and an organisation that wants every connection to go through a declared socket can require that as a governance policy. Declaring the socket here remains the better path and is what the standard-library catalog does: a declared socket carries a `selector` constraining which components the edge may reach, an `inject:` allowlist, a per-edge contract with its own defaults, and a description — a reviewable statement of an anticipated connection, versioned with the entity that makes it. The ad-hoc form is an escape hatch, not a new default. Two surfaces are deliberately not open this way — a Feature attachment's `uses` may only name a socket the attached Feature declares, and a Release's per-edge `uses` may only name a socket the consuming Component declares.

The worked example [`examples/adhoc-uses-socket/`](../examples/adhoc-uses-socket/) builds both kinds of edge on one consumer and shows the two delivered values side by side in the rendered output, alongside the halt an undeclared `from:` key produces.

**Socket-name typos surface as an advisory, not a halt.** Because an undeclared socket name is legal, a misspelled socket name becomes an ad-hoc connection of its own rather than wiring the socket the author meant — and the build stays green while nothing flows over it. The compiler reports a socket name that is within one edit of a name this `usesSchema` declares as a warning naming both spellings — see [errors/warnings.md](../errors/warnings.md) "Uses-socket near-miss lint". The warning never changes the build's verdict; the compiler does not police what an author names a socket.

**The `usesSchema` vs `featuresSchema` relationship.** Both are declarative tables and both carry an `inject:` allowlist with identical semantics, but a socket and a slot are different things and are not interchangeable. `usesSchema` governs cross-component edges — the topology graph — declaring which sockets carry a contract. `featuresSchema` governs attachment slots, and a slot is a *named binding point*, not an enumeration: an attachment under a name no slot declares is legal. The two surfaces have converged on that point — a component's own `uses:` entry under an undeclared socket name is legal too — but they remain distinct: an undeclared *slot* is a free attachment on a Component whose declared slots are unaffected, while an undeclared *socket* is an edge with no selector and no per-edge contract. Many Components declare both; the two tables compose independently.

## Attachment Slots: `featuresSchema`

A Component may declare attachment slots through a `featuresSchema` block. Each slot names a binding point at which the Component expects a Feature to be attached — a root password, an API key, an auth token, an identity binding — and constrains which Feature may bind it and how the fill's material may be delivered.

**Declaring a slot does not close the attachment surface.** An author may attach a Feature under a name no slot declares, and that attachment is a *free attachment*: perfectly legal, simply not bound to a declared slot. This openness is what lets one catalog entity serve two different deployment shapes without a catalog fork:

* **Per-consumer.** Each instance fills the slot with its own Feature, so each consumer gets its own rendered credential.
* **Shared.** No instance fills the slot; instead one credential is attached once at a broader scope (a subsystem, or a Release boundary) and cascades to every component under it, so many consumers point at one rendered Secret.

The author chooses between them by what they attach. The catalog entity is the same in both cases.

**The two shapes compose, and the nearer one wins.** An author may do both at once: attach a Feature at a broader scope so it reaches every component under that scope, and fill the slot on the one component that needs something different. The component-scoped fill wins — field by field, so it need only restate the fields it changes and the rest still come from the broader attachment. The sibling components that did not fill the slot keep the broader attachment untouched. The full precedence rule, including how it interacts with annotation-driven attachments and with composed Aggregates, is at [`vocabulary/labels-and-annotations.md`](../vocabulary/labels-and-annotations.md) "Attachment precedence".

**Schema definition on the Component:**

```yaml
spec:
  featuresSchema:
    root_password:
      inject: []
      description: Root database password. Recipe controls delivery (Black-Box).
    user_password:
      inject: [env, file]
      description: Application user password, auto-generated if omitted.
    replication_password:
      inject: []
      description: Replication password for HA setups.
```

**Field semantics:**

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `required` | bool | `false` | Declares that the slot must end up bound. The build halts when nothing binds the slot's name on an instance of this Component, checked against the attachment set the instance holds after the whole attachment cascade — so an attachment declared at a scope the instance inherits from satisfies the slot exactly as a fill authored on the instance itself does. The diagnostic names the component and the slot. |
| `inject` | string[] | — | Allowlist of allowed inject delivery mechanisms. `[]` (empty) means blackbox — the Recipe controls delivery internally and the material is never delivered to the workload. `[env, file]` means transparent — the fill's material may be delivered through the listed mechanisms. Same semantics as `usesSchema[].inject`. |
| `description` | string | — | Human documentation, rendered by IDE and hub. |
| `selector` | string | — | Optional Kubernetes-style label selector constraining which Feature may fill this slot — the slot analog of a `usesSchema` socket's `selector`, with the same grammar and the same native label-matching engine. Evaluated against the attached Feature's own labels during static analysis; a fill whose labels do not satisfy it halts, and so does a selector the grammar refuses, naming the requirement it could not read. Omit to place no constraint on the fill. |
| `sensitive` | bool | `false` | Declares that whatever binds this slot handles secret material. A statement about the binding point, not about any particular fill; see "Declaring a slot sensitive" below. |

A slot constrains *which fill may bind it*, not what the fill configures. There is deliberately no slot-level `values` or `infra` contract: the attached Feature's own `schema:` owns those pillars, so each contract has exactly one home.

The slot `selector` is how a Component narrows which Feature may fill a slot — for example to a provider-specific credential Feature (`feature.aggrega.ai/kind=secret, provider=helm`) — without naming a FeatureRecipe, exactly as a `usesSchema` socket selector narrows a dependency edge's target. The compiler evaluates the selector against the attached Feature's labels and nothing else: it reads the labels the fill carries, and reports whether the selector admits them. Which labels are meaningful to require is a catalog-authoring choice, not a rule the compiler imposes.

**Slot-name typos surface as an advisory, not a halt.** Because an undeclared attachment name is legal, a misspelled slot name becomes a free attachment rather than filling the slot the author meant. The compiler reports an attachment name that is within one edit of a declared slot name as a warning naming both spellings — see [errors/warnings.md](../errors/warnings.md) "Attachment-slot near-miss lint". The warning never changes the build's verdict; the compiler does not police what an author names an attachment.

### Declaring a slot sensitive

`sensitive: true` on a slot states the consumer's own demand: *whatever binds this point handles secret material.*

```yaml
spec:
  featuresSchema:
    password:
      selector: "feature.aggrega.ai/kind=secret"
      sensitive: true
      inject: [env]
      description: "Optional database password credential."
```

This is genuinely different information from a schema leaf's `sensitive: true`, not a convenience duplicate of it, and the standard-library catalog needs both. A referenceable credential publishes `provides.name` and `provides.key` — the resource's locator and the data key within it — and **neither is sensitive**: a Kubernetes Secret's name is public, and so is the key inside it. Yet the slot that credential fills unquestionably handles secret material. A leaf says *this datum is secret material*; a slot says *this binding point handles secret material*; the two claims are about different things and can hold independently.

The practical consequence is that the demand travels with the binding point rather than the fill. A Feature that declares no sensitive leaf at all — because the target engine owns the credential and the author writes nothing — still binds a sensitive slot as a sensitive attachment, because the slot said so. The reverse also holds: a fill declaring a sensitive leaf is a sensitive attachment even when it binds a slot that made no such declaration, or when it is a free attachment binding no slot.

The declaration follows the attachment cascade rather than any one authored block. A slot's demand applies to whichever fill ends up bound after every scope has folded, so a component-level fill that displaces a broader one inherits the demand unchanged.

`sensitive` on a slot carries the same ceiling the leaf-level keyword does — it annotates, it does not encrypt, validate, reject, force a delivery mechanism, or change a rendered byte. The full statement is at [`vocabulary/compact-form-authoring.md`](../vocabulary/compact-form-authoring.md) "What the keyword does not do".

**`sensitive` and `compliance.aggrega.ai/data-class` are two different axes**, documented adjacently and never conflated. `sensitive` is a boolean on one leaf or one slot: *this datum, or this binding point, handles secret material.* `compliance.aggrega.ai/data-class` is a graded label on a whole node — `public`, `internal`, `restricted` — giving the data a component holds a governance identity. One is per-datum and binary, the other per-node and ordered; neither substitutes for the other, and an entity may carry both. The label is covered at [`vocabulary/labels-and-annotations.md`](../vocabulary/labels-and-annotations.md) and [architecture/08-credential-model.md](../../architecture/08-credential-model.md) "Data governance around credentials".

### Schema projection from `featuresSchema`

Declared slots project into a JSON Schema 2020-12 fragment describing the shape of the attachment block, and an authored block is validated against it when the Aggregate loads. The projection never touches disk; it exists only in memory, and a Component's `schema:` never needs to hand-author the attachment pillar.

Input `featuresSchema`:

```yaml
featuresSchema:
  root_password:
    inject: []
  user_password:
    inject: [env, file]
```

Projected fragment (in memory; compact-form representation):

```yaml
# The OUTER object is open: an attachment under a name no slot declares is
# admitted, because a free attachment is legal authoring.
root_password:
  type: { type: string }
  description: { type: string }
  values:
    type: object
    additionalProperties: true
  # inject is ABSENT — inject: [] means the Recipe controls delivery
user_password:
  type: { type: string }
  description: { type: string }
  values:
    type: object
    additionalProperties: true
  inject:
    env: { type: array }
    file: { type: array }
    # arg is absent — not in the inject allowlist
```

The two depths are independent. The **outer** object is open, so a declared slot never forbids the attachments the entity did not enumerate. Each **declared slot's** own fragment is closed, so a fill that does bind a declared slot is still constrained to that slot's shape.

The fragment describes SHAPE only. It carries no statement about which slots must be bound, because a slot marked `required` may be bound by an attachment cascading in from a broader scope — which leaves the block this fragment describes empty. The requirement is therefore checked against the attachment set a component ends up with rather than against what any one block declares, and the two questions never contradict each other because only one of them is ever asked of the authored block.

The permitted keys mirror the keys an attachment may carry anywhere, so a key that is legal on a free attachment stays legal on a slot fill. Each allowlisted delivery mechanism is a list of delivery entries — the same shape `inject:` takes everywhere; the slot narrows which mechanism NAMES may appear, not what an entry looks like.

### Where the `inject` allowlist is enforced

The allowlist binds both sides of the slot, at two different steps.

Against the **Recipe's Workload**, at the render step: a Workload that references a slot through its container attachment entries must name a slot the entity declares, and must select a delivery mechanism the slot's `inject` allowlist permits; a reference to a blackbox slot (`inject: []`), to a mechanism outside the allowlist, or to a slot the entity never declared halts the build. The diagnostic names the Recipe, the container path, and the offending slot, and is classified as a catalog fault — the Recipe is what got it wrong.

Against the **Aggregate's own attachment**, when its attachments are resolved and ahead of any rendering: an `inject:` block on a fill that binds a declared slot may name only mechanisms the slot's allowlist permits, and a blackbox slot permits none — its empty allowlist says "the Recipe delivers this internally; do not dictate delivery," and authoring delivery for it halts the build. The diagnostic is positioned on the attachment and names the slot and the offending mechanism, together with the mechanisms the slot permits where it permits any; it is classified as a developer fault, because the Aggregate is what got it wrong. A free attachment — one under a name no slot declares — carries no such constraint, because the allowlist belongs to the slot and not to the block.

The end-to-end flow through the compilation pipeline — how an Aggregate attachment connects to a credential Feature (such as `core/secret-value`) and then to a provider-specific FeatureRecipe that delivers the credential to the running workload — is worked through in [examples/05-credential-features](../examples/05-credential-features.md).

### Credential delegation through typed reference fields

Components whose role is to orchestrate other catalog entities — agents that compose Model and Tool entities, pipelines that chain transformer stages, gateways that fan out to downstream services — frequently carry **zero** entries in their own `featuresSchema:`. Their credential delegation flows transitively through typed reference fields in `values:`, which point to other Components or Features that carry their own `featuresSchema:` at their own scope.

A canonical example: a `core/ai-agent` Component declares `values:` fields like `models: [...#ModelRef]` and `tools_allowed: [...#ToolRef]`. The Model and Tool entities each carry their own `featuresSchema:` (API key for the model endpoint; per-Tool credentials for the targeted services). The agent itself does not own those credentials; the referenced entities own them at their own catalog scope.

```yaml
# core/ai-agent Component carries no featuresSchema — its credentials are delegated
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: core/ai-agent
  version: 1.0.0
spec:
  schema:
    values:
      models:
        type: array
        items:
          $ref: "AiTypes#/schemas/ModelRef"
      tools_allowed:
        type: array
        items:
          $ref: "AiTypes#/schemas/ToolRef"
  # featuresSchema absent: agents own no secrets directly
```

```yaml
# core/ai-model Component carries its own featuresSchema for the model endpoint's API key
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: core/ai-model
  version: 1.0.0
spec:
  schema:
    values:
      endpoint: { type: string, format: uri, required: true }
      capability: { type: string, enum: [generative, embedding, transcription], required: true }
  featuresSchema:
    api_key:
      required: true
      inject: [env]
      description: API key for the model endpoint
```

The convention is: **secrets co-locate with the entity that uses them, not with the entity that orchestrates them.** When the agent's Aggregate declares the agent's `values.models[0]` pointing at a specific Model instance, that Model instance's `featuresSchema:` is what enumerates the agent's transitive credential requirements. The compiler walks the topology graph and validates that every Model / Tool / downstream reference's credential slots are satisfied through their own attachments; the agent does not need to repeat them.

The pattern preserves cohesion: a Model entity that gains a new credential requirement (e.g., a region-specific authentication token) updates its own `featuresSchema:` and every consumer of that Model immediately requires the new credential. The agents that compose the Model do not need to track the change; the validation flows through the typed reference.

Aggregate-level secrets declared at the agent — credentials the agent itself owns rather than delegates — go through the standard `featuresSchema:` mechanism. The two patterns compose: an agent may carry a small `featuresSchema:` for its own operational credentials (e.g., a database connection for the agent's state store) while delegating model and tool credentials to the referenced entities.

## Self-inject: `spec.inject`

A Component may declare a top-level `spec.inject:` array that allowlists self-inject delivery mechanisms. When present, developers may use an `inject:` block at the **component level** in the Aggregate to inject the Component's own `values:` or `provides:` keys directly into its own delivery pipe (its container's environment variables, mounted files, or process arguments). When `spec.inject:` is absent or empty, component-level self-inject is forbidden — the Recipe controls all internal wiring, matching the Black-Box pattern that `usesSchema[].inject: []` and `featuresSchema[].inject: []` apply to cross-component and credential delivery respectively.

```yaml
# Component declares its self-inject allowlist:
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: core/web-server
spec:
  inject: [env, file]
  schema:
    values:
      log_level: { type: string, default: info }
      tls_enabled: { type: boolean, default: false }
    provides:
      health_endpoint: { type: string }
```

```yaml
# Aggregate fragment — developer dictates self-inject delivery:
components:
  api:
    type: core/web-server
    values:
      log_level: debug
      tls_enabled: true
    inject:
      env:
        - in: LOG_LEVEL
          value: "{{ .values.log_level }}"
        - in: TLS_ENABLED
          value: "{{ .values.tls_enabled }}"
      file:
        - in: /etc/web/health-probe
          from: health_endpoint
```

**Field semantics.** `spec.inject:` is an array of mechanism names. Three values are defined:

* `env` — environment variables in the container.
* `file` — mounted file paths.
* `arg` — process command-line arguments.

The semantics mirror `usesSchema[].inject` and `featuresSchema[].inject` exactly — same vocabulary, same Black-Box pattern when omitted, same authoring shape on the Aggregate side. The difference is the source: `usesSchema[].inject` governs how a cross-component dependency's `provides` flows into the consumer's delivery pipe; `featuresSchema[].inject` governs how a credential reaches a container; `spec.inject` governs how the Component's own `values` and `provides` reach the Component's own container.

**Authoring discipline.** A `core/web-server` Component declaring `spec.inject: [env, file]` opts into transparent delivery — the Aggregate author dictates which env-var names carry which values. A Component declaring `spec.inject: []` (or omitting the field) keeps delivery opaque — the Recipe's `valuesMapping:` decides which fields flow into which container variables, and the developer cannot override at the Aggregate. The Black-Box pattern suits stable contract Components (a `core/postgres-db` Component whose Recipe knows how to wire the DB password into a `POSTGRES_PASSWORD` env var); the transparent pattern suits Components where the developer's intent legitimately names delivery details (a `core/web-server` whose application reads `LOG_LEVEL` from a non-standard variable name the developer wants to customize).

**Error modes.** A developer's Aggregate using an `inject:` block on a Component whose `spec.inject:` is missing or empty halts the build at workspace load with `ErrSelfInjectForbidden`. An `inject:` block using a mechanism not in the allowlist halts with `ErrInvalidInjectKey`. A delivery-key collision across self-inject, cross-component inject, and credential inject halts with `ErrInjectKeyCollision`. See [errors/fatal-halts.md](../errors/fatal-halts.md) for the per-error message shapes.

## Catalog Authoring: Extending Base Components

Platform Architects use the `extends` keyword to layer specialized interfaces on top of corporate or community baselines. Extending **composes structure** and **inherits the data pillars whole**. The compiler walks the chain from the base down; the two halves behave differently, and the difference is the whole authoring model.

**What extending composes.** These surfaces merge along the chain, with the extending Component winning per key and lists concatenating base-first without duplicates:

| Surface | How it composes |
| --- | --- |
| `metadata.labels` | merged per key; the extending Component's value wins on a shared key |
| `metadata.annotations` | merged per key, same precedence — which is why a base's presence mandate reaches every Component extending it |
| `spec.featuresSchema` | attachment slots union; a slot the extending Component redeclares replaces the base's entry of that name |
| `spec.usesSchema` | topology sockets union, same per-name replacement rule |
| `spec.inject` | the two self-inject allowlists concatenate, base entries first, duplicates dropped |
| `spec.assertions` | named rules accumulate, base rules first — and this one surface admits **no** per-name replacement; see "Assertion inheritance is additive" below |

A socket the extending Component adds may carry its own per-edge `valueSchema` and `infraSchema`; those are contracts on that socket's edges, not additions to the Component's own pillars.

**The rest of `metadata:` stays with the document that declares it.** `labels` and `annotations` are the only metadata that travels down the chain. `name`, `version`, `description`, `maintainers`, `license`, `repository`, `home` and `keywords` are the extending Component's own, read exactly as it authored them — a Component that omits `description:` has none rather than borrowing its base's. Identity and provenance belong to the document you are reading, so a wrapper is never mistaken for the thing it wraps.

**What extending inherits whole.** The three data pillars — `values`, `infra`, `provides` — are not composed. An extending Component authors no pillar content: it writes the literal marker `schema: inherited` and receives its base's `schema:` block exactly as the base authored it. Along a chain of any depth, every Component in it carries the chain root's block unchanged, so `aggrega inspect --resolved` on a leaf shows the same pillars as the root.

The published Component schema settles which of the three possible outcomes is legal, and it rejects the other two when the document loads — with a different diagnostic for each, because they are different mistakes:

* **`extends:` with pillar content under `schema:`** is rejected. The Component's contract is its base's; a second, divergent contract has nowhere to live.
* **`extends:` with `schema:` omitted entirely** is rejected. An omission would leave a reader unable to tell an inherited pillar block from a forgotten one.
* **`schema: inherited` with no `extends:`** is rejected. The marker names where the pillars come from, and this Component has no base to take them from.

**An extending Component cannot reshape the key set.** It declares no pillar keys, so it cannot hide, drop, or retype a key its base declares, and it adds none of its own. A new pillar key belongs on the Component whose contract owns it. Whatever the base exposes, everything extending it exposes identically.

**A specialization tightens through `assertions:`.** When a specialization must admit less than its base's pillars do — a narrower numeric range, a subset of an inherited `enum:` — it says so in its own `assertions:` block: a rule there rejects a value the inherited schema accepts. That is the surface where tightening lives; see "The `assertions:` block" below.

Those last two paragraphs are one rule, and either half alone misleads: **key-set narrowing is impossible, constraint-tightening is possible.** Take only the first and you conclude a specialization cannot constrain anything; take only the second and you conclude it can reshape the contract. Neither is so — the key set is fixed by the base, and the values admitted within it may be narrowed by predicate.

**Assertion inheritance is additive, and the accumulation is root-first.** An instance of an extending Component is checked against every rule its chain declares as well as the rules the Component declares itself, with the inherited ones evaluated first. Along a chain of any depth the rules accumulate from the chain root downward, so when an instance would fail more than one rule, the one declared furthest up the chain is the one reported — the most fundamental contract answers first.

Because inheritance adds rather than replaces, an extending Component may not reuse an inherited rule name to declare a *different* rule: that is rejected when the extends chain is resolved against the catalog, with a diagnostic naming both Components and the shared name. The check needs the base Component in hand, so it reports when the catalog is validated or a build resolves the chain — validating the extending document on its own cannot see it. The rule name is a stable identifier, so neither dropping the base's rule nor silently renaming it is an option, and the fix is a rename in the extending Component. Restating an inherited rule byte-for-byte under its own name is accepted as the no-op it is.

See [architecture/13-catalog-and-registry.md §3](../../architecture/13-catalog-and-registry.md) for the schema content formats.

**Example A: The Base Component (The Corporate Baseline)**
The Platform Architect defines a foundational enterprise server. This base sets the required operational cloud primitive label and establishes the security constraints in the schema. Because the pillar block is inherited unchanged, every constraint here reaches each extending Component exactly as authored.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: core/base-enterprise-server
  version: 1.0.0
  labels:
    component.aggrega.ai/type: "server"
spec:
  inject: [env]
  schema:
    values:
      # The corporate baseline constraint. Every Component extending this base
      # receives this leaf verbatim; none of them can restate or loosen it.
      tls_enabled: { type: boolean, enum: [true], default: true }

      # An open range at the baseline. A specialization that needs a tighter
      # bound expresses it as an assertion, not as a redeclared schema leaf.
      timeout_ms: { type: integer, default: 5000 }
  assertions:
    # A baseline invariant. It is evaluated for instances of this Component AND
    # for instances of every Component extending it, under this same name.
    audit-window-is-observable: |
      {{- if lt (int .values.timeout_ms) 100 -}}
        {{- fail "the corporate baseline needs timeout_ms of at least 100 so requests are observable" -}}
      {{- end -}}
```

**Example B: The Extending Component (Specializing the Baseline)**
A gateway is specialized from that baseline. It takes the base's pillars whole, adds structure of its own — a label, a self-inject mechanism, a topology socket, an attachment slot — and tightens the inherited timeout through an assertion. It does not restate the baseline's `audit-window-is-observable` rule: that rule is inherited and is evaluated first, so an instance of this gateway must satisfy both bounds — at least 100 and at most 2000.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: core/gateway/kong
  version: 1.0.0
  labels:
    # Every Component declares the reserved base-ontology key, including one
    # that extends: the envelope requires it on the document itself.
    component.aggrega.ai/type: "server"
    api.aggrega.ai/protocol: "http"               # merged with the base's labels
spec:
  extends: core/base-enterprise-server
  schema: inherited        # values, infra and provides are the base's, verbatim
  inject: [file]           # concatenates with the base's [env] -> [env, file]
  usesSchema:              # a socket of its own; the base declared none
    backend:
      required: true
      selector: "component.aggrega.ai/type=stateful-server"
      inject: [env]
  featuresSchema:          # a slot of its own
    password:
      sensitive: true
      inject: [env]
      description: Password credential shared with the configuration backend.
  assertions:
    # The tightening. The inherited schema admits any integer for timeout_ms;
    # this gateway admits only 2000 or less, so the rule rejects a value the
    # inherited pillar block would accept.
    timeout-within-gateway-budget: |
      {{- if gt (int .values.timeout_ms) 2000 -}}
        {{- fail "the gateway must answer within 2000ms: set timeout_ms to 2000 or less" -}}
      {{- end -}}
```

For the Recipe that implements this `core/gateway/kong` interface against a physical Helm chart, see [entities/recipe](recipe.md) Example C (`kong-gateway`).

## The `assertions:` block

`Component.spec.assertions:` is an optional map of **named** rules expressing **architectural invariants of the Component contract** — cross-field rules the developer's authoring must satisfy regardless of which Recipe binds to the Component. Each key is a rule identifier that appears in the failure message; each value is a Go template body. The compiler evaluates them per instance after schema validation and before Recipe binding, in the order they are written, and the first failing rule halts the build with that rule's own error message per the Loud Guardrails contract.

```yaml
spec:
  assertions:
    replication-needs-two-secondaries: |
      {{- if eq .values.architecture "replication" -}}
        {{- if lt (int .values.secondary.replicaCount) 2 -}}
          {{- fail "architecture=replication requires secondary.replicaCount >= 2" -}}
        {{- end -}}
      {{- end -}}
```

The rule above is a property of the Component contract — whatever Recipe binds (Bitnami chart, hand-rolled alternative, future implementation), replication mode requires at least two secondary replicas.

**`assertions:` is where an extending Component tightens.** A Component that `extends:` a base inherits the base's pillar block verbatim and declares no pillar content of its own, so a specialization that must admit less than the inherited schema does states the restriction here as a predicate rather than as a narrowed schema leaf — a rule that rejects a value the inherited pillars accept. The worked pair, and the full inheritance behaviour, are at "Catalog Authoring: Extending Base Components" above: rules accumulate along the chain root-first, and reusing an inherited rule name for a different rule is rejected rather than allowed to replace it.

**The compiler does not check whether two rules can both be satisfied.** A rule is a template predicate, not a constraint the compiler reasons about, so a pair of rules no value can satisfy at once — a base demanding at least 100 and a specialization demanding at most 50 — produces no warning when the catalog loads. It surfaces the ordinary way: an instance is authored, the build halts on whichever of the two fires first, and that rule's message is what the author reads. Do not expect a contradiction to be reported up front; check a specialization's tightening against what its base already demands.

Use `assertions:` for genuine **cross-field** rules. Per-field constraints (range, pattern, enum) belong in `schema:` keywords; per-field custom predicates belong in the compact form's `validate:`; conditional shape (whether a subtree's constraints apply) belongs in `when:`. For the full authoring grammar — template context fields, the `{{ fail }}` message convention, the evaluation phase, and worked examples spanning the Component and Recipe roles — see [templates/assertions-block.md](../templates/assertions-block.md).
