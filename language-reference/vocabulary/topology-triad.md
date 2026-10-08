# provides, inject, uses

## 4. The Injection Contract & Pre-Resolved Map

Because Aggrega is an Ahead-of-Time (AOT) static compiler, no data flows backward from the live infrastructure during compilation. It is mechanically impossible for the compiler to actively fetch a physical credential (like an AWS secret) and pass it "back" to the Developer's container environment.

Instead, the platform relies on **True Control Inversion**. When a developer writes `inject: { env: [{ in: ORACLE_PASSWORD, from: "password" }] }`, they are not initiating a data fetch; they are dictating a strict contract to the infrastructure.

1. **The Intent (Domain 1):** The Developer declares an abstract interface: *"I require a secret. I don't know where it lives. Just inject it into my environment as `ORACLE_PASSWORD` mapping to the catalog's `password` key."*
2. **The Compiler Transfer (at rendering):** The Go compiler takes the entry `{ in: ORACLE_PASSWORD, from: "password" }` and hands it to the Ops Recipe. No physical secret is fetched.
**3. The Plugin Output (Domain 3):** The credential FeatureRecipe's Wasm pipeline generates the precise interlocking artifacts required by the target infrastructure. For example, in Kubernetes, it outputs the `ExternalSecret` CRD (instructing the cluster to fetch the vault data) **AND** executes a JSONPatch against the target Pod to map the resulting local K8s Secret specifically to the developer's requested `"ORACLE_PASSWORD"` environment variable.
**4. The Runtime Reality:** At runtime, the an operator in cluster simply executes these generated artifacts—fetching the credential and physically mounting it into the container—completely decoupling the physical security mechanics from the AOT compiler.

To deliver this physical reality to the application without violating the Separation of Concerns, Aggrega utilizes the **Injection Contract**. However, this contract strictly differentiates between custom application code and Commercial Off-The-Shelf (COTS) infrastructure:

* **White-Box (Custom Code):** The component is a generic worker (e.g., a custom Python agent). The Go compiler and the Ops Recipe have *no idea* what variables the developer's custom script expects. Therefore, the Developer **MUST** dictate the delivery via the `inject:` block — both for cross-component dependencies (via `uses[].inject` with `from:` referencing the target's `provides`) and for the component's own values (via component-level `inject` with `value:` literals or `from:` referencing its own `provides`). Which mechanisms are allowed is declared per surface, and the two declarations are separate: the component's own values are governed by the `spec.inject` allowlist (e.g., `inject: ["env", "file"]`), while a `uses:` edge is governed by the allowlist on the socket it is wired through, `spec.usesSchema.<socket>.inject`. Dictating a mechanism the governing allowlist does not name halts the build on either surface.
* **Black-Box (Packaged Compute):** The component is a closed system (e.g., Redis, a managed API Gateway). The Ops Recipe *already knows* exactly how the system consumes its data. Therefore, the Component catalog entity **omits** the allowlist, which forbids dictation outright rather than narrowing it — omitting `spec.inject` forbids component-level self-inject, and a socket declared without an `inject:` allowlist forbids any `inject:` block on an edge wired through it. The Developer simply provides the dependency target via `uses`, and the platform handles the internal wiring natively via the Recipe's `valuesMapping`.

**The Deterministic Addressing Rule (Internal Network Physics)**
Aggrega's `.context.uses` pipe dynamically injects target strings into containers at compile time. Because the core Go compiler is completely blind to physical networking, what counts as a valid address string relies entirely on a **Social Contract** upheld by Platform Ops, not a compiler function — the compiler pipes whatever deterministic pointer string the Ops Recipe produced into the downstream template context without interpretation.

**The Rule: The Ops Recipe must export a deterministic, stable address pointer.** The provider does not calculate IPs. Instead, the target's Ops Recipe *should* formulate a predictable string and expose it via the `.locals` contract (e.g., exporting `.locals.internal_host: "http://agent-b.namespace.svc.cluster.local"` in Kubernetes, or an interpolation string like `"${module.db.endpoint}"` in Terraform, where the module declares a matching `output` for the value).

Relying on the compiler to fetch post-provisioning dynamic IPs directly violates the AOT execution model. Because the compiler evaluates the topology *before* the cloud provisions any actual compute, it cannot physically fetch data that does not yet exist. If a service requires a random IP that is only generated after the compute boots, the compiler cannot physically fetch it. The compiler's only job is to blindly pipe the deterministic pointer string provided by the Ops Recipe into the calling container's environment variables, leaving the final resolution to the cluster's DNS or the active IaC state manager.

Enforcing deterministic addressing natively solves **cyclic dependencies** (e.g., Agent A delegates to Agent B, and Agent B delegates back to Agent A). Because the stable URL or IaC pointer is calculable as a string before either container actually spins up, the compiler safely wires both agents together without introducing temporal race conditions.

*(Note: This rule applies to external ingress as well. If an architecture exposes a public API Gateway and requires that URL to be injected back into an internal container, the Go compiler cannot fetch the random cloud-generated URL (e.g., `xyz123.execute-api.aws.com`) because it does not exist at compile time. Ops must author their Recipe to either map a deterministic custom domain (e.g., `api.enterprise.com`) or export the native IaC interpolation string, ensuring the AOT compiler has a known reference to safely inject).*

**The Implementation Mechanics (The Catalog as the API Contract)**
To implement this without tightly coupling Developers to Ops, Aggrega uses the Platform Catalog (Domain 2) as the strict API contract, utilizing three distinct layers of validation:

1. **The Credential Feature Schema (labeled `feature.aggrega.ai/kind: secret`):** Validates **ONLY** the vault query (`path`, `key`). It is completely blind to how the container consumes the data.
2. **The `Component` Schema (`spec.inject` Allowlist):** Enforces the Black-Box/White-Box rule via the `spec.inject` field. If `spec.inject` is present (e.g., `inject: ["env", "file"]`), the developer may use component-level self-inject with those delivery mechanisms. If `spec.inject` is omitted, the compiler structurally forbids self-inject — Black-Box components rely entirely on the Recipe's `valuesMapping` for internal wiring. This is a structural envelope-shape enforcement at the schema layer, distinct from per-pillar content validation under `schema:`.
3. **The `featuresSchema` Map:** Defined in the Component Catalog, this explicitly declares the credential slots the Developer must (or may) use. Each entry specifies `required` (default `false`), `inject` allowlist (`[]` = blackbox, `[env, file]` = transparent), and `description`. Because these keys are stable and contractually guaranteed, the Ops Engineer can directly rely on them to reliably dictate deterministic targets in their Go template (e.g., `existingSecret: "{{ .context.rendered_name }}-{{ .locals.secret_target_admin_password }}"` on the `helm` target), explicitly exporting the name's suffix via `.locals` — a local cannot read `.context.rendered_name` — so the downstream credential FeatureRecipe joins the same two parts and fulfills the requirement without violating AOT execution order. See §14 for the full `featuresSchema` design.

**The Strict Placement Rule:** The `inject:` mechanism is available in three locations in the Developer's `Aggregate`:

1. **Component-level self-inject:** As a direct sibling to `values:` on a component instance. Injects the component's own literal values or its own `provides` keys into the delivery pipe. Only allowed if the Component catalog declares `spec.inject` with the corresponding mechanisms.
2. **Uses-level cross-inject:** Inside explicit target definitions within the `uses:` block. Injects a dependency target's `provides` keys into the delivery pipe.
3. **Feature/Secret-level inject:** As a sibling to `values:` when attaching features and secrets. Injects the attachment's own resolved `provides` keys — the resolved credential for a secret, or a feature's provided values — into the delivery pipe.

All three forms populate the same `.context.inject` pipe. The Recipe reads a single, unified pipe regardless of how many sources contributed to it.

The `inject` schema defines standard enums (`env`, `file`, `arg`) for tooling, but leaves `additionalProperties` completely open for infinite extensibility (e.g., `ssm_param` for AWS Systems Manager Parameter Store).

**Polymorphic Inject Syntax:** The `inject` block supports two syntaxes: a compact map form and a verbose array form. The compact form's meaning depends on placement context. The verbose form uses explicit keywords (`from:` or `value:`) that are unambiguous everywhere.

**Compact Form Disambiguation (Placement-Based):**
The compact form `KEY: "string"` has different semantics depending on where it appears. The YAML structure is the discriminator — no sigils or prefixes required:

| Placement | Compact `KEY: "string"` | `"string"` means |
| :--- | :--- | :--- |
| `component.inject` | Literal value | Always a **literal string** (sugar for `value:`) |
| `uses[target].inject` | Provides key reference | Always a **provides key** (sugar for `from:`) |
| `features[<name>].inject` | Provides key reference | Always a **provides key** — resolved against the attachment's own `provides` |

**Verbose Form Keywords (`from:` and `value:`):**
The verbose form uses the `in` keyword for the local identifier plus exactly one of `from:` (provides key reference) or `value:` (literal string):

| Keyword | Meaning | Allowed in `component.inject` | Allowed in `uses[].inject` |
| :--- | :--- | :--- | :--- |
| `from:` | Resolve against provides | ✅ Own node's provides | ✅ Target node's provides |
| `value:` | Literal string (supports Go templates) | ✅ | ❌ (`value:` is not valid in `uses[].inject`; use component-level `inject` for self-inject) |

**Examples:**

```yaml
# Component-level self-inject (White-Box custom code)
components:
  my-worker:
    type: core/python-worker:1.0.0
    values:
      app_token: "xyz"
    inject:
      env:
        - in: MY_TOKEN
          value: "xyz"                     # Literal value
        - in: LOG_LEVEL
          value: "debug"                   # Literal value
        - in: CALLBACK_HOST
          from: "host"                     # From own provides (already evaluated)
        - in: APP_VERSION
          value: "{{ .values.app_token }}" # Go template expanding own values
    uses:
      databases:
        my_db:
          target: postgres-db
          inject:
            env:
              - in: DB_HOST
                from: "host"               # Provides key from target
              - in: DB_PORT
                from: "port"               # Provides key from target
              - in: DB_URL
                from: "dsn"                # From target's provides
```

**Provider-specific note (compose).** When `uses:` edges resolve between compose-targeted nodes, the compose provider derives `depends_on` entries from those edges. Those entries always use `service_started` semantics regardless of any target's `health:` block; gating them on the target's health is not implemented. See [providers/compose.md](../providers/compose.md) for the full inference rules.

**The Inject Key Collision Rule:**
A developer requesting the same delivery key (e.g., the same env var name) from two different sources is a fatal error, not a merge. The compiler detects the collision and halts the build:

| Source A | Source B | Result |
| :--- | :--- | :--- |
| `component.inject` | `uses[].inject` | ❌ fatal halt — duplicate delivery key |
| `uses[target_A].inject` | `uses[target_B].inject` | ❌ fatal halt — duplicate delivery key |
| `component.inject` | `features[<name>].inject` | ❌ fatal halt — duplicate delivery key |
| `uses[].inject` | `features[<name>].inject` | ❌ fatal halt — duplicate delivery key |
| `features[A].inject` | `features[B].inject` | ❌ fatal halt — duplicate delivery key |
| `component.inject` (same key twice) | — | ❌ fatal halt — duplicate delivery key |
| `features[A]`'s FeatureRecipe `injectMapping` | `features[B]`'s FeatureRecipe `injectMapping` | ❌ fatal halt — duplicate delivery key across two attachments |
| `features[A].inject` | `features[B]`'s FeatureRecipe `injectMapping` | ❌ fatal halt — duplicate delivery key across two attachments |
| `component.inject` or `uses[].inject` | FeatureRecipe `injectMapping` | ✅ Legal — interception by design: the mapping's value replaces that entry |
| `features[A].inject`, `features[A]`'s FeatureRecipe `injectMapping`, or boundary Feature `A`'s environment override | boundary Feature `B`'s environment override | ❌ fatal halt — duplicate delivery key across two attachments |
| `component.inject` or `uses[].inject` | a boundary Feature's environment override | ✅ Legal — interception by design: the override's value replaces that entry |

The table reads every attached Feature the same way, wherever it was attached — on the component, at a subsystem or a Release boundary, by an annotation's expansion, or on a connection. A FeatureRecipe's `injectMapping` renders after every `inject:` block has delivered, so it is always the later of two claims: it may rewrite what the component or one of its connections delivered, and it may rewrite what its own attachment's `inject:` block delivered, but a key another attached Feature already delivered halts the build, naming both.

A Feature attached to a Release boundary whose FeatureRecipe renders once for the boundary (`executionScope: boundary`) has one more route: its rendering plugin may compute an environment override for the components the boundary holds, applied after every `injectMapping` — the compose bridge rewriting a consumer's host variable to reach its target through the gateway is the shipped case. The override is held to the same rule as a mapping: it may rewrite what the component or one of its connections delivered, and what its own Feature delivered, but a key another attached Feature delivered — or another boundary Feature's override — halts the build, naming both.

To prevent Go template boilerplate in Recipes, the compiler provides **both**:

* `.context.uses`: The enriched topological edge map (for complex logic, secret references, and origin tracking).
* `.context.inject`: A pre-resolved, flattened dictionary where the compiler has already resolved all inject sources (self-inject literals, self-inject provides references, and cross-component provides references) into final string values, then applied FeatureRecipe `injectMapping` interceptions and any boundary Feature's environment override.

**The Dual-State Injection Context (Null-Safety vs. AST Purity)**
When generating configurations for Modifiers (the FeatureRecipe bound to any attachment, credential or otherwise), the compiler must balance null-pointer safety for Go templates, dynamic network routing, and the preservation of a capability-agnostic AST graph. To achieve this, the compiler natively provides a dual-state context at the root level of the template execution:

* **`.inject_raw` (The Immutable Intent):** Represents the exact, unmutated YAML intent authored by the developer in Domain 1. It is immutable. If the developer omitted the block, this evaluates to `null`. Ops utilizes this specifically for logical checks (e.g., `{{ if not .inject_raw }}` to apply fallback behaviors). Because it is immutable, it protects Ops templates from false positives if routing features intercept and mutate the physical delivery pipe.
* **`.inject` (The Pre-Hydrated & Intercepted Pipe):** A parallel, compiler-generated struct representing the physical delivery reality. It starts as a pre-hydrated map (e.g., mapping `API_HOST` to the target's base string `"backend-instance"`). Crucially, this pipe is designed to be **intercepted and deep-merged** by Features (e.g. network routing) utilizing the `injectMapping` block. By the time the Base Recipe renders, this pipe contains the fully formatted, physically correct strings (e.g. a correct complete network name like `"backend-instance.backend-zone.svc.cluster.local"`). Its contents are structured as `env`, `file`, `arg` (plus any custom delivery mechanisms allowed by the Component's inject allowlists), with a pre-merged `.all` dictionary combining all mechanisms for convenient whole-pipe serialization.

Ops utilizes the `.inject` struct exclusively for safe serialization (e.g., `{{ toJson .inject.all }}`) and routing generation, ensuring the physical infrastructure receives the fully resolved coordinates while the developer's original AST intent remains perfectly intact in `.inject_raw`.

**Developer YAML Example (Granular Map):**

```yaml
uses:
  databases:
    my-postgres-cluster:
      inject:
        ssm_param: # Agnostic injection paradigm (AWS Systems Manager)
          - in: MY_DB_HOST   # Local identifier
            from: "host"     # Target provides key
```

The compiler resolves this at compile-time (mapping to static AST strings or internal DNS names) and passes the two objects to the Recipe:

```json
"context": {
  "uses": { ... raw graph ... },
  "inject": {
    "env": { "MY_DB_HOST": "db-main.internal" },
    "ssm_param": { "MY_DB_HOST": "db-main.internal" }
  }
}
```

**Connection-scoped configuration (`values` and `infra`).** Beyond delivering a target's `provides` via `inject`, an edge may carry its own configuration — per-connection settings the consuming Recipe reads from the enriched topology pipe:

* `.context.uses.<alias>.values` — developer-authored, declared in the Aggregate's verbose `uses` entry, validated against the socket's `valueSchema`.
* `.context.uses.<alias>.infra` — operator-authored, declared in the Release, validated against the socket's `infraSchema`.

The socket (`usesSchema[<socket>]`) is the Architect's contract for which connections are possible and what configuration they may carry; `values` and `infra` split that configuration by authoring domain, mirroring the values/infra split on components. So an edge has two authors: the developer wires the topology and tunes it with `values` in the Aggregate, while the operator sets per-connection `infra` in the Release within the sockets the Architect declared. The Release may also wire an edge into a declared-but-unbound socket to an existing component; it may not retarget a developer-declared edge — see [entities/release.md](../entities/release.md) §"Per-edge connection configuration".

Per-edge configuration is consumer-scoped: it surfaces only in the context of the node that authored the edge (the connection's source), never in the target's context. A target's own rendered output is therefore invariant with respect to the consumers that connect to it. A Feature attached to the target is the one place the connections are visible: its FeatureRecipe reads which components use the target at [`.context.used_by`](../templates/template-context-contract.md#the-components-that-use-this-one--contextused_by) — each one's identity, socket, published `provides`, the namespace and boundary it is placed in, and, for a FeatureRecipe that declares it reads them, the render facts its providers reported — never the connection's own `values` or `infra`.

**Connection attachments (`features`).** A connection may also carry attachments of its own — a credential the consumer presents to the component this connection reaches, say — under `features:` on its entry, keyed by a slot the socket declares in its `featuresSchema`. The same two authors split them: the developer attaches on the Aggregate's connection entry with `type` and `values`, and the operator sizes that attachment with `infra`, or attaches one of its own with `type` and `infra`, on the Release's entry. An attachment on a connection carries no `inject` block of its own, which is why it is absent from the placement rule above: it is not one of the places a developer dictates delivery.

Each becomes an attachment of the **consuming** component named `<alias>.<slot>`, so it is consumer-scoped exactly as per-edge configuration is: its FeatureRecipe renders on the consumer's side, and the target's output does not change with it. It is kept out of the consuming Recipe's `.features`, which holds only the attachments the component's own block declares; the Recipe reads it under its connection instead, at `.context.uses.<alias>.features.<slot>`. A connection a Feature attachment draws carries no attachments. See [entities/aggregate.md](../entities/aggregate.md) §"A connection's own attachments" and [entities/component.md](../entities/component.md) §"Topology Sockets".

**A. Environment Variables (`env`) & Dynamic Destination Resolution**
The standard delivery mechanism for modern cloud-native applications. For explicit topological edges (e.g., an Agent talking to a Database), Aggrega uses `.context.uses` to inject the environment variable mapping.

* **Use Case:** Receiving deterministic internal DNS names, Infrastructure-as-Code interpolation strings (e.g., `${module.db.endpoint}`), or static Vault pointers. The compiler wires these static references AOT so the runtime infrastructure or GitOps controller can resolve the live values.

**B. File Mounts (`file`)**
Many enterprise AI frameworks expect a structured `config.json` or `.pem` certificate to exist at a specific path on the disk, rather than relying on environment variables.

* **Use Case:** Injecting complex JSON configurations or satisfying legacy SDKs that read from disk.
* **Dev Intent:**

    ```yaml
    features:
      openai_key:
        type: core/aws-secrets-manager
        values:
          path: /prod/ai/openai
          key: "api_token"
        inject:
          file:
            - in: "/etc/secrets/openai.json" # Local path
              from: "api_token"              # Target provides key
    ```

* **Ops Reality:** The Ops Recipe dynamically generates the Kubernetes `Volume`, `VolumeMount`, and `ExternalSecret` required to securely pull the vault data and mount it to `/etc/secrets/openai.json`.

**C. Command-Line Arguments (`arg`)**
Pre-compiled binaries (like Rust or Go worker nodes) often bypass environment variables entirely, expecting values to be passed as runtime flags in their execution command.

* **Use Case:** Appending physical realities to the container's startup command.
* **Dev Intent:**

    ```yaml
    features:
      public-ingress:
        type: core/external-ingress
        values:
          hostname: api.enterprise.com
        inject:
          arg:
            - in: "--callback-url="  # Local flag
              from: "hostname"       # Target provides key
    ```

* **Ops Reality:** The Feature's Wasm plugin receives the resolved public URL via the Injection Contract and emits a JSONPatch to dynamically append the Kubernetes `args` array: `["/app/binary", "--callback-url=https://api.enterprise.com"]`, completely bypassing the Component's Base Recipe.
