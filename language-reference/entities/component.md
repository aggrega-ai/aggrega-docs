# Component

The conceptual role of the Component entity (the abstract compute-node interface in Domain 2) lives in [architecture/04-eight-entity-taxonomy.md](../../architecture/04-eight-entity-taxonomy.md). This page covers the Semantic Label Taxonomy — the label vocabulary Architects use to layer cognitive identity on top of the 7-type base ontology. Additional authoring-surface detail (schemas, worked examples) lands during later migrations.

## The Semantic Label Taxonomy (The Standard Library Convention)

If the base types are purely cloud-native, the operational and cognitive intelligence of the architecture is layered entirely through semantic duck-typing.

The core Go compiler does not read these labels. The compiler builds the flat Intermediate Representation (IR) graph without interpreting label semantics. These labels represent the **Standard Library Convention**—immutable "genetic markers" authored by the Platform Architect in Domain 2. They provide the explicit semantic hooks the Wasm policy validators and the physical Ops Recipes use to govern the architecture.

**(A) The Generic Cloud Layer**
These labels describe universal behaviors, allowing policy engines and generated L7 proxies to govern standard enterprise architectures without needing to natively understand AI frameworks.

| Label Prefix | Allowed Values (Convention) | Why Platform Ops needs it (The Policy Hook) |
| :--- | :--- | :--- |
| `api.aggrega.ai/protocol` | `http`, `grpc`, `tcp`, `udp` | Allows Ops rendering plugins (like an Istio recipe) to know if they should configure HTTP termination or just pass raw TCP packets. |
| `tool.aggrega.ai/impact` | `read-only`, `mutating` | Allows policy engines to evaluate Least-Privilege AuthZ. Mutating tools can automatically trigger policies that require strict approval-gate sidecars to be attached. |
| `datastore.aggrega.ai/engine` | `relational`, `vector`, `blob` | Allows policy engines to enforce cross-node type-safety (e.g., preventing an agent from attempting to send SQL payloads to a Vector DB). |
| `execution.aggrega.ai/pattern` | `sync`, `async`, `autonomous-loop` | Allows policies to distinguish between a standard background worker and a runaway AI agent, mandating strict Time-To-Live (TTL) timeouts for autonomous loops. |
| `gateway.aggrega.ai/intelligence` | `semantic`, `l4-mesh` | Dictates what features a router can physically support (e.g., preventing token-budget features on a standard TCP mesh). |

**(B) The Specialized AI Layer (The Cognitive Identity)**
These labels describe the *cognitive* identity of the workload, allowing the architecture to secure modern AI frameworks and memory structures.

| Label Prefix | Allowed Values (Convention) | Why Platform Ops needs it (The Policy Hook) |
| :--- | :--- | :--- |
| `model.aggrega.ai/capability` | `generative`, `embedding`, `transcription` | Used by the `usesSchema` selector strings (evaluated natively by the Go compiler in Step 4) to guarantee a developer doesn't accidentally route a generative text payload to an embedding endpoint. |
| `model.aggrega.ai/hosting` | `saas`, `local` | Allows policy engines to calculate Data Exfiltration risk (e.g., routing internal data to a SaaS LLM). |
| `agent.aggrega.ai/autonomy` | `autonomous`, `copilot` | Identifies the execution risk of the cognitive loop, allowing policies to mandate human-approval features for fully autonomous agents. |
| `cognitive.aggrega.ai/memory` | `semantic`, `episodic`, `working` | Natively supports the CoALA framework. Policy engines read this label on a database to mandate `read/write` scopes for episodic logs, but strict `read-only` access for semantic enterprise facts. |

**(C) The Cross-Cutters (Governance, State, & Hardware)**
These represent the foundational enterprise tags that drive Zero-Trust validation and hardware routing.

| Label Prefix | Allowed Values (Convention) | Why Platform Ops needs it (The Policy Hook) |
| :--- | :--- | :--- |
| `compliance.aggrega.ai/data-class` | `public`, `internal`, `restricted` | Tracked topologically by the policy engine. If a continuous path exists from a `public` node to a `restricted` database without a masking proxy feature attached, the policy halts the build. |
| `compliance.aggrega.ai/contains-pii` | `true`, `false` | Explicitly flags workloads for GDPR/CCPA. Policy engines use this to mandate the attachment of specific L7 data-redaction proxies. |
| `hardware.aggrega.ai/accelerator` | `gpu`, `tpu`, `npu` | Used by DevOps in the `Release` file. They explicitly route these components into physical hardware pool boundaries (e.g., a GPU-capable cluster) via the `components: {}` map, while `policy-validator.wasm` can enforce that GPU-labeled components are never placed in non-GPU boundaries. |
| `state.aggrega.ai/retention` | `retain`, `delete` | **Solves the AOT Deletion Blind Spot.** If a developer deletes a database from their `Aggregate`, a GitOps orchestrator will physically drop the disk. A `mutator.wasm` plugin can read the `retain` label and automatically mutate the output artifacts to include orchestrator-native protection (e.g., `helm.sh/resource-policy: keep`). |
| `state.aggrega.ai/backup-tier` | `mission-critical`, `standard`, `ephemeral` | **SOC2 Availability Hook.** Tells the Ops `FeatureRecipe` whether to physically generate automated Snapshot/Volume Backup configurations for the resource. |

**(D) The Dynamic Business Context (Cascading Annotations)**
While `labels` define the immutable Catalog DNA, dynamic business contexts (like SOC2 audit scoping or FinOps cost tracking) change depending on who deploys the application and where it runs. These are governed by **Annotations** injected dynamically by the Developer's `subsystems`, the Ops `Release` boundaries, or the `mutator.wasm` auto-tagger.

| Annotation Prefix | Allowed Values (Convention) | Why Platform Ops needs it (The Policy Hook) |
| :--- | :--- | :--- |
| `business.aggrega.ai/cost-center` | e.g., `finance`, `ai-research` | Required by Wasm rendering plugins to inject physical tagging (e.g., AWS tags or K8s labels) into the final generated artifacts for cloud billing dashboards. |
| `business.aggrega.ai/owner` | e.g., `team-alpha@corp.com` | Incident Response routing. Guarantees the infrastructure is mapped to a human team. |
| `compliance.aggrega.ai/frameworks` | e.g., `soc2, hipaa` | **SOC2 Scope Trigger.** Injected via the environment `Release`. Wasm plugins read this string to automatically generate rigid audit-logging sidecars and disable debug ports when an application enters a production compliance boundary. |

*The taxonomy is a catalog convention, not a compiler rule. Enterprises can ignore it, delete it, or invent their own label vocabulary (`mycompany.com/custom-trait`). Wasm plugins evaluate whatever label keys the enterprise authors.*

## Schema Authoring

The `Component` schema (and its `Feature` counterpart, including credential Features labeled `feature.aggrega.ai/kind: secret`) declares the validation contract for developer-authored `values` through a `spec.schema:` block. The block accepts JSON Schema 2020-12 expressed either in the compact-form YAML shorthand (the default; about 15 keywords, mechanically transformed to JSON Schema at compile time) or in full JSON Schema YAML (the verbose form), with cross-document references via `$ref:` for SchemaLibrary entries shared across multiple Components.

* **Inline compact form (default authoring surface):** an embedded YAML block carrying compact-form leaves directly in the Component YAML. Fits ~95% of catalog schema content in a fraction of the line count of full JSON Schema. See [`vocabulary/compact-form-authoring.md`](../vocabulary/compact-form-authoring.md) for the keyword vocabulary and authoring conventions.
* **Inline JSON Schema YAML:** the verbose form, suitable when the schema needs JSON Schema 2020-12 keywords the compact form does not carry directly (`$dynamicRef`, deep `unevaluatedProperties`, complex `not:` composition). Compact form and JSON Schema can be mixed at any node boundary within a single `schema:` block via the `$jsonschema:` escape hatch.
* **Cross-document reference (`$ref:` to a SchemaLibrary entry):** a JSON Schema-native `$ref:` URL pointing at a SchemaLibrary entry (`oci://hub.aggrega.ai/aggrega/datastores@1.0.0#/schemas/MariaDBValues` or similar). Enterprise schemas spanning hundreds of lines and reused across multiple Components live in SchemaLibrary entities; the consumer Component references the entry without inlining the content. See [`entities/schemalibrary.md`](schemalibrary.md) and [`vocabulary/cross-document-ref.md`](../vocabulary/cross-document-ref.md) for the library entity and the resolution semantics.

The compiler resolves the `schema:` block — expanding compact form, dereferencing `$ref:` URLs, applying SchemaLibrary library-to-library chains — and unifies the resulting JSON Schema with the auto-generated bases derived from `usesSchema` and `secretsSchema` (see the section below) during the Component's validation pass. Validation runs against the resolved schema; the authoring path is opaque to downstream pipeline stages.

## The `infra` Pillar

The Component schema separates three pillars by ownership: `values` is filled by the Developer in the Aggregate (cognitive intent — database name, version, charset), `infra` is filled by the Operator in the Release (operational sizing — compute, storage, HA, backup), and `provides` is set by the Recipe (the public API contract — host, port, protocol). The Developer never sees `infra`; the Operator never sees `values`. Recipes consume both during Phase B rendering, mapping the abstract pillars into the concrete shape their target provider expects.

Three `infra` conventions matter across every provider-agnostic Component in the standard library: an open-struct escape hatch for provider-specific knobs, an optional override for the upstream artifact version, and an intent-based vocabulary for high-availability fields. The canonical reference Component is [`core/database/mariadb`](../../../aggrega-hub/aggrega-catalog/component/core/database/mariadb.yaml) — implementable by Helm Recipes against the Bitnami chart, Terraform Recipes against AWS RDS, CloudFormation Recipes against the same RDS surface, and Compose Recipes against a local container — and its `infra` block illustrates all three patterns.

### `infra.overrides`

Universal `infra` fields — `compute`, `storage`, `ha`, `backup` — cover roughly 95% of operational sizing across providers. The remaining slice is irreducibly provider-specific: a Kubernetes Recipe needs a `nodeSelector`, an RDS Terraform Recipe needs an `instance_class`, a CloudFormation RDS Recipe needs a `DBInstanceClass`, a Compose Recipe needs an `image` override. The Component schema exposes a genuinely-open map as the escape hatch so these knobs flow through without bloating the schema:

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
      Overrides the Recipe's default source artifact version.
      Changing from default does not guarantee value mapping compatibility.
```

The Recipe reads this as a Go template default in its `source` block:

```yaml
source:
  registry: oci://registry-1.docker.io/bitnamicharts
  chart: mariadb
  version: "{{ optional .infra `source_version` `25.0.8` }}"
```

Recipe `source` strings (and string-valued sub-fields of a structured `source:` map) are evaluated as Go templates with the same self-contained context as Recipe `provides` — `.context.instance_id`, `.values`, `.infra`, and the same node's resolved `.provides`, with `.context.inject` and `.context.uses` forbidden. See [Template Expansion Matrix row #5](../templates/expansion-matrix.md) for the full availability rules. Changing `infra.source_version` away from the Recipe's default does not guarantee that the Recipe's `valuesMapping` is wire-compatible with the new upstream version; the inline comment on the Component schema's `source_version` declaration carries that warning.

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

## Required Features: `requiredFeatures`

A Component may declare a list of Feature types that **must** be attached to every instance of that Component. The `spec.requiredFeatures` field carries an array of Feature type URIs; the compiler verifies that every required type appears in the resolved feature set for each Component instance after the 5-Tier Onion Model attachment cascade completes.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: core/payment-processor
  version: 1.0.0
  labels:
    component.aggrega.ai/type: server
spec:
  requiredFeatures:
    - core/audit-logging:1.0.0
    - core/pci-compliance:1.0.0
  schema:
    values:
      processor_endpoint: { type: string, required: true }
```

The compiler walks every Feature attached to a `core/payment-processor` instance — across the Aggregate component-level and subsystem-level features blocks, the Release boundary-level and component-level features blocks, and the Manifest annotation-driven expansion (when shipped) — and confirms each `requiredFeatures:` entry has a matching attachment. A missing required Feature halts the build with a fatal diagnostic naming the component instance, the missing Feature type, and the attachment surfaces the compiler searched.

The mechanism enforces architectural invariants the Component contract demands. A payment-processing Component that requires `core/audit-logging` ensures every deployment carries the audit-logging Feature regardless of whether the developer remembered to attach it; a PCI-compliant Component requiring `core/pci-compliance` cannot ship without the compliance Feature being explicitly attached at the Release surface.

The diagnostic message is documented at [`errors/fatal-halts.md`](../errors/fatal-halts.md) "Required feature not attached".

## Credential Slots: `secretsSchema`

A Component may declare credential slots through a `secretsSchema` block — a declarative YAML map parallel to `usesSchema`. Each slot names a credential the Component needs (a root password, an API key, an auth token) and governs how the developer's Aggregate may populate it. The compiler auto-generates JSON Schema 2020-12 validation rules from the declared slots and unifies them with the Component's `schema:` during Component resolution; developers do not hand-author a `secrets:` pillar inside `schema:`, because the structure comes from `secretsSchema`.

**Schema definition on the Component:**

```yaml
spec:
  secretsSchema:
    root_password:
      required: true
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
| `required` | bool | `false` | When `true`, the developer must provide this secret in their Aggregate `secrets:` block. When `false` or omitted, the secret is optional. |
| `inject` | string[] | — | Allowlist of allowed inject delivery mechanisms. `[]` (empty) means blackbox — no `inject:` block allowed on the developer's secret, Recipe controls delivery. `[env, file]` means transparent — the developer may dictate delivery via the listed mechanisms. Same semantics as `usesSchema[].inject`. |
| `description` | string | — | Human documentation, rendered by IDE and hub. |

The `required: false` default matches the most common authoring pattern: most Components work fine without an explicit credential provided by the developer, because the Recipe or the underlying chart supplies a sensible default or auto-generates one. Only credentials the Component genuinely cannot boot without are marked `required: true`.

### Schema generation from `secretsSchema`

The compiler generates a base JSON Schema 2020-12 fragment from the declared slots and composes it with the user's `schema:` declaration — the same pattern `usesSchema` uses for its own base schema generation. The generated schema never touches disk; it exists only in memory during the Component validation pass.

Input `secretsSchema`:

```yaml
secretsSchema:
  root_password:
    required: true
    inject: []
  user_password:
    inject: [env, file]
```

Generated base schema (in memory; compact-form representation):

```yaml
secrets:
  root_password:
    type: { type: string, required: true }
    values:
      type: object
      additionalProperties: true
    # inject is ABSENT — inject: [] means no inject block allowed
  user_password:
    # optional at the parent — `required` defaults to false for this slot
    type: { type: string, required: true }
    values:
      type: object
      additionalProperties: true
    inject:
      env: { type: object, valuesType: string }
      file: { type: object, valuesType: string }
      # arg is absent — not in inject allowlist
```

The compiler composes the generated base with the user's `schema:` declaration under JSON Schema 2020-12 composition, producing a single validation schema for the Component's authored instances. The user's `schema:` does not need a `secrets:` pillar — the generated schema handles all structure and validation for the declared slots.

### Validation behavior

If a developer attempts to populate a blackbox slot with an `inject:` block, the compiler halts during Component validation:

```yaml
# Developer writes in Aggregate:
secrets:
  root_password:
    type: core/secret-value:1.0.0
    values:
      source: "{{ .parameters.db_root_pass }}"
      key: mariadb-root-password
    inject:                    # ← schema validation REJECTS this
      env:                     #    because the generated base schema
        DB_PASS: root_password #    has no inject field for root_password
```

The developer gets a clear error: *"field `inject` not allowed on secret `root_password` (blackbox: Recipe controls delivery)."*

The end-to-end flow through the compilation pipeline — how the Aggregate's `secrets:` block connects to a credential Feature (such as `core/secret-value`) and then to a provider-specific FeatureRecipe that delivers the secret to the running workload — is worked through in [examples/05-credential-features](../examples/05-credential-features.md).

### Credential delegation through typed reference fields

Components whose role is to orchestrate other catalog entities — agents that compose Model and Tool entities, pipelines that chain transformer stages, gateways that fan out to downstream services — frequently carry **zero** entries in their own `secretsSchema:`. Their credential delegation flows transitively through typed reference fields in `values:`, which point to other Components or Features that carry their own `secretsSchema:` at their own scope.

A canonical example: a `core/ai-agent` Component declares `values:` fields like `models: [...#ModelRef]` and `tools_allowed: [...#ToolRef]`. The Model and Tool entities each carry their own `secretsSchema:` (API key for the model endpoint; per-Tool credentials for the targeted services). The agent itself does not own those credentials; the referenced entities own them at their own catalog scope.

```yaml
# core/ai-agent Component carries no secretsSchema — its credentials are delegated
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
          $ref: "oci://hub.aggrega.ai/aggrega/ai-types@1.0.0#/schemas/ModelRef"
      tools_allowed:
        type: array
        items:
          $ref: "oci://hub.aggrega.ai/aggrega/ai-types@1.0.0#/schemas/ToolRef"
  # secretsSchema absent: agents own no secrets directly
```

```yaml
# core/ai-model Component carries its own secretsSchema for the model endpoint's API key
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
  secretsSchema:
    api_key:
      required: true
      inject: [env]
      description: API key for the model endpoint
```

The convention is: **secrets co-locate with the entity that uses them, not with the entity that orchestrates them.** When the agent's Aggregate declares the agent's `values.models[0]` pointing at a specific Model instance, that Model instance's `secretsSchema:` is what enumerates the agent's transitive credential requirements. The compiler walks the topology graph and validates that every Model / Tool / downstream reference's credential slots are satisfied through their own attachments; the agent does not need to repeat them.

The pattern preserves cohesion: a Model entity that gains a new credential requirement (e.g., a region-specific authentication token) updates its own `secretsSchema:` and every consumer of that Model immediately requires the new credential. The agents that compose the Model do not need to track the change; the validation flows through the typed reference.

Aggregate-level secrets declared at the agent — credentials the agent itself owns rather than delegates — go through the standard `secretsSchema:` mechanism. The two patterns compose: an agent may carry a small `secretsSchema:` for its own operational credentials (e.g., a database connection for the agent's state store) while delegating model and tool credentials to the referenced entities.

## Catalog Authoring: Extending Base Components

Platform Architects use the `extends` keyword to layer specialized interfaces on top of corporate or community baselines. The compiler recursively fetches the parent and performs a **Two-Tiered Merge**: it deep-merges the YAML metadata (overwriting labels on conflict and appending arrays) and composes the schemas via JSON Schema 2020-12 composition (the parent's `schema:` and the child's `schema:` merge under `allOf`-style narrowing semantics enforced by the publishing-discipline policy plugin). The schema composition is strictly monotonic — a child may narrow a parent's constraint (e.g., tighten an `enum:` set, shrink a numeric range), but never relax or bypass it. The publishing-discipline policy plugin rejects publishes where a child Component declares a constraint that relaxes a parent's.

See [architecture/13-catalog-and-registry.md §3](../../architecture/13-catalog-and-registry.md) for the Schema Formats and Composition mechanism.

**Example A: The Base Component (The Corporate Baseline)**
The Platform Architect defines a foundational enterprise server. This base template sets the required 7-Type cloud primitive label and establishes immutable security constraints in the schema.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: core/base-enterprise-server
  version: 1.0.0
  labels:
    component.aggrega.ai/type: "server"
spec:
  schema:
    values:
      # The corporate baseline constraint: child Components must not relax this constraint.
      # The publishing-discipline policy plugin rejects any child that declares
      # tls_enabled with a value space wider than {true}.
      tls_enabled: { type: boolean, enum: [true], default: true }

      # Default fallback for application logic; children may narrow this integer's range.
      timeout_ms: { type: integer, default: 5000 }
```

**Example B: The Child Component (Extending the Baseline)**
A specialized AI Gateway is created. The Component inherits from the base enterprise server, so the Architect does not rewrite the base ontology labels or the `tls_enabled` security constraint.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: core/ai-gateway
  version: 1.0.0
  labels:
    gateway.aggrega.ai/intelligence: "semantic" # Appended to parent labels
spec:
  extends: core/base-enterprise-server # Triggers the Two-Tiered Merge
  schema:
    values:
      # New field local to the child; routing-mode enum narrows from the open string type.
      routing_mode: { type: string, enum: [latency_optimized, cost_optimized], default: latency_optimized }

      # NOTE: a child Component that declared
      #   tls_enabled: { type: boolean, enum: [false] }
      # would be rejected at publish time by the publishing-discipline policy plugin —
      # the child's constraint (enum: [false]) relaxes the parent's (enum: [true]).
```

For the Recipe that implements this `core/ai-gateway` interface against a physical Helm chart, see [entities/recipe](recipe.md) Example C (`kong-gateway`).

## The `assertions:` block

`Component.spec.assertions:` is an optional Go template body that expresses **architectural invariants of the Component contract** — cross-field rules the developer's authoring must satisfy regardless of which Recipe binds to the Component. The compiler evaluates the template after schema validation and before Recipe binding; a failing assertion halts the build with the assertion's specific error message per the Loud Guardrails contract.

```yaml
spec:
  assertions: |
    {{- if eq .values.architecture "replication" -}}
      {{- if lt .values.secondary.replicaCount 2 -}}
        {{- fail "architecture=replication requires secondary.replicaCount >= 2" -}}
      {{- end -}}
    {{- end -}}
```

The rule above is a property of the Component contract — whatever Recipe binds (Bitnami chart, hand-rolled alternative, future implementation), replication mode requires at least two secondary replicas.

Use `assertions:` for genuine **cross-field** rules. Per-field constraints (range, pattern, enum) belong in `schema:` keywords; per-field custom predicates belong in the compact form's `validate:`; conditional shape (whether a subtree's constraints apply) belongs in `when:`. For the full authoring grammar — template context fields, the `{{ fail }}` message convention, the evaluation phase, and worked examples spanning the Component and Recipe roles — see [templates/assertions-block.md](../templates/assertions-block.md).
