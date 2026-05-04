# Credential Model

## Part 8: Data Governance & The Credential Pillar

In the Aggrega architecture, we strictly differentiate between **Business Data** (the state held by an application) and **Credentials** (the keys required to access that state). While the generated network mesh configurations govern "Data in Motion" (Topological Data Flows), "Data at Rest" and "Secrets" are handled by the **Credential Pillar** and **Ops Baselines** to ensure maximum cryptographic isolation.

### 1. Data Governance via Semantic Identity
Aggrega does not model data schemas (rows, columns, or files), as these are application-layer concerns. Instead, we model the **Governance and Gravity** of data using labels.
* **Stateful Nodes:** Data resides exclusively in components with cloud primitives such as `stateful-server`, `resource`, or `messaging`.
* **Identity via Labels:** Platform Architects use the `compliance.aggrega.ai/data-class` label (e.g., `public`, `internal`, `restricted`) to give the data a semantic identity. This label informs the `policy-validator.wasm` socket and instructs Wasm rendering plugins on how to physically protect the storage configuration.

### 2. Encryption at Rest: An Ops Baseline
Encryption at rest (e.g., KMS-encrypted EBS volumes or TDE for databases) is intentionally **excluded** from the core compiler logic and the Developer's `Aggregate`.
* **The Separation of Concerns:** In an enterprise environment, encryption is a non-negotiable corporate mandate, not a developer "feature."
* **Mechanics:** The Ops Engineer authors the `Recipe` for stateful components to inherently include encryption configuration logic. When the Wasm rendering plugin processes a `restricted` label on a node, the generated physical template for that node is hardcoded to provision encrypted storage classes, regardless of what the developer requests in their `values` block.

### 3. The Credential Pillar (The Blind Compiler)
To prevent the catastrophic exposure of passwords or API keys, Aggrega treats secrets as a first-class pillar decoupled from standard application `values`.
* **The Credential Feature Interface:** Developers query credentials through Features labeled `feature.aggrega.ai/kind: secret`, providing only the vault location (e.g., `path`, `key`) via the `values` block. In the Aggregate, these are placed in the `secrets:` block (not `features:`) to preserve cognitive clarity — the compiler enforces this partition via the label.
* **The Blind Compiler Rule:** The Go compiler is mathematically blocked from resolving secrets into plaintext strings. The secret request is stored in the flat IR Graph's `secrets` object as a metadata pointer.
* **Late Binding Delivery:** The physical credential is only resolved by the credential FeatureRecipe's Wasm pipeline during the final stage of Step 5 (The Infrastructure Rendering Engine). It is delivered to the container via the **Injection Contract** (`env`, `file`, or `arg`), ensuring the plaintext secret never touches the compiler's logs or the application's generated persistent configuration files.

### 4. Legacy Systems with CI/CD Parameter Handoff
Aggrega is designed for the real world, where legacy Helm charts sometimes require plaintext passwords directly in `ConfigMaps` or `values.yaml`.
* **The AOT Reality:** Because Aggrega is an AOT static compiler, it cannot authenticate with AWS to fetch a live secret during `aggrega build`. It can only map vault pointers.
* **The Solution (Parameter Hoisting):** If a chart actually requires a plaintext string, the Developer must bypass the `secrets` pillar and hoist the requirement to the `parameters` block (e.g., `parameters: legacy_db_pass: string`).
* **The Pipeline Execution:** The enterprise CI/CD pipeline (e.g., GitHub Actions) authenticates with the vault, retrieves the plaintext secret, and passes it to the Aggrega compiler via the CLI (e.g., `aggrega build --set parameters.legacy_db_pass=$DB_PASS`). The Release maps this string directly into the Wasm rendering pipeline.

### 5. Local Development Secret Resolution (The `.env` Polyfill)
The golden use case for Developer Experience is running `aggrega build` locally targeting the `compose` provider, using a local `.env` file instead of AWS Secrets Manager.
* **The Mechanism:** The developer maintains their pure `Aggregate` pointing to `core/aws-secrets-manager`. However, their local `Manifest` overrides the credential Feature mapping to route to a local FeatureRecipe (e.g., `compose-env-injector`).
* **The Execution:** The AOT compiler does not fetch the `.env` file. The local Wasm plugin assigned to the credential FeatureRecipe simply outputs native Docker Compose syntax: `env_file: [".env"]` or `${SECRET_NAME}`. Docker Compose automatically resolves the local file at runtime.

### 6. The Two-Part Secret Pipeline (Maximizing Reusability)

See [Credential Features worked example](../language-reference/examples/04-secrets.md) (Example 11) for the full Two-Part Plugin Principle with Fetcher / Injector plugin orchestration and concrete JSON input/output handshake.

### 7. The Runtime Templating Polyfill (The "Substring" Trap)
A fundamental law of an Ahead-of-Time (AOT) compiler is that it cannot format strings containing data generated at runtime.

**The Trap:** If an application strictly requires a single connection string containing a plaintext password or a dynamically generated cloud endpoint (e.g., `ORACLE_DSN="oracle://admin:PASSWORD@HOST:1521/DB"`), the developer might try to use the AOT compiler to format it. The compiler will fail, generating a configuration that injects the literal pointer string (e.g., `arn:aws:secretsmanager:...`) instead of the password, crashing the application at runtime.

**The Native Ops Solution (Cluster-Side Rendering):**
To solve this without breaking the AOT compiler's blindness to live secrets, Platform Ops must handle the substring formatting natively inside the target cluster.

If an application demands a single formatted DSN string, the Ops credential FeatureRecipe (a `FeatureRecipe` carrying the `feature.aggrega.ai/kind: secret` label) Wasm plugin generates configuration utilizing the native templating capabilities of the cluster's vault operator (e.g., the Kubernetes External Secrets Operator's `template` block).

```json
// The Wasm plugin emits an ExternalSecret CRD utilizing runtime templating
{
  "apiVersion": "external-secrets.io/v1beta1",
  "kind": "ExternalSecret",
  "metadata": { "name": "oracle-dsn-secret" },
  "spec": {
    "target": {
      "name": "oracle-formatted-dsn",
      // Formatting happens LIVE in the cluster, completely out-of-band from the AOT Compiler
      "template": {
        "engineVersion": "v2",
        "data": {
          "ORACLE_DSN": "oracle://admin:{{ .password }}@10.0.5.55:1521/PROD_DB"
        }
      }
    },
    "data": [
      {
        "secretKey": "password",
        "remoteRef": { "key": "arn:aws:secretsmanager:prod/oracle" }
      }
    ]
  }
}
```
The application Pod simply references the resulting `oracle-formatted-dsn` K8s Secret. The AOT compiler wired the relationships seamlessly through generated configurations, while deferring the secure plaintext interpolation to the highly-secure runtime environment.

### 8. Feature Credentials (The Coupling Problem)
When a developer attaches an operational Feature (like a Datadog telemetry sidecar or a Lakera AI proxy) to a Component, that Feature often requires its own API key.

If the developer is forced to place the Feature's API key inside the parent Component's `secrets` block, it creates a fatal coupling violation. The Component is no longer atomic, and the Wasm plugin generating the Feature's configuration must dangerously "reach up" into the parent's scope to hunt for its credential.

Aggrega solves this by granting `Features` their own native `secrets` dictionary. This enables two distinct enterprise authentication paradigms without forcing opinions on the user:

**A. The "Zero-Touch" Corporate Paradigm (Implicit Auth)**
In many enterprises, tools like Datadog or Lakera use a single Global Corporate API Key. Developers should not be forced to provide this key 50 times across their `Aggregate`.
* **The Dev UX:** The Developer attaches the Feature and configures *only* the logic (e.g., `action: redact`). They omit the `secrets` block entirely.
* **The Ops Reality:** Platform Ops hardcodes the 2-part Secret Fetcher Wasm pipeline directly into the `FeatureRecipe`, pointing it to the static corporate Vault path (`path: /corp/security/lakera-key`). The credential injection configuration is entirely invisible to the developer.

**B. The Multi-Tenant Paradigm (Explicit Auth)**
If an open-source Feature allows developers to bring their *own* API keys (e.g., a Weights & Biases tracker), the Feature must mandate it.
* **The Catalog Contract:** The Platform Architect adds `secretsSchema: { api_key: { required: true, inject: [] } }` to the `Feature` catalog definition.
* **The Dev UX:** The Developer must explicitly declare the `secrets` block nested directly inside the `features` object in their `Aggregate`. The AOT compiler's Syntax Validator guarantees the credential is provided before any infrastructure configuration is generated.
