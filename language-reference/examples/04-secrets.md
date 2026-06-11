# Secrets

## The secret-delivery checklist

Implementing a credential pattern end-to-end touches six surfaces across the four domains. The mental model authors carry when wiring a new secret: every credential flows through these six touch-points before it reaches a running container.

| Step | Surface | Action |
| --- | --- | --- |
| 1 | Component `secretsSchema:` (or `schema.secrets`) | **Declare** the credential slot. Slot definitions specify the slot name, whether it is `required`, the `inject:` allowlist (`[env]`, `[file]`, `[]` for blackbox), and a description. The Component author chooses White-Box (transparent: developer dictates delivery) or Black-Box (opaque: Recipe controls delivery) by setting the `inject:` allowlist accordingly. |
| 2 | Credential Feature `schema:` | **Define** the vault-query contract for the credential type. The Feature carries the `feature.aggrega.ai/kind: secret` label and declares the values keys (e.g., `path`, `key`) that authors supply when requesting the credential. |
| 3 | Aggregate component instance `secrets:` block | **Request** the credential at the developer's authoring surface. The block specifies the credential Feature `type`, the vault-query `values`, and (for White-Box slots only) the `inject:` mapping that wires the resolved credential to the application's expected delivery shape. |
| 4 | FeatureRecipe `pipeline:` (Two-Part Plugin Principle) | **Implement** the credential's runtime resolution. The Fetcher plugin generates the cloud-specific CRD (`ExternalSecret`, `VaultSecret`, etc.) referencing the developer's vault path; the Injector plugin mounts the resolved Kubernetes Secret to the target container at the developer's requested key. Swapping vaults (AWS → HashiCorp) only replaces the Fetcher; the Injector is reusable. |
| 5 | Manifest `mappings.features.type` | **Bind** the credential Feature type to its FeatureRecipe, in the same `features.type` tier as operational Features. There is no separate `secrets` mapping section. Provider dispatch flows from each resolved FeatureRecipe's `spec.provider` field at orchestrator time, not from a per-provider Manifest tier. |
| 6 | Recipe `valuesMapping:` template (Black-Box only) | **Reference** the dictated physical secret name when the slot is Black-Box. The Recipe's `valuesMapping:` consumes `{{ .locals.secret_target_<slot> }}` (or the equivalent Recipe-published pointer) and feeds the chart's native secret-mount mechanism (`existingSecret`, etc.). White-Box slots skip this step — the Workload's `secrets:` block carries the delivery directly. |

The split between White-Box (Steps 1, 2, 3, 4, 5) and Black-Box (Steps 1, 2, 3, 4, 5, 6) determines how many touch-points a particular credential pattern requires. White-Box is five surfaces; Black-Box is six. The audit's "six artefact touches" framing covers the Black-Box case, which is the heavier of the two and the one Recipe authors most often implement when wrapping packaged infrastructure (Bitnami charts, managed services, etc.).

The three worked examples below demonstrate the pattern across the canonical scenarios: White-Box (Example 11), Black-Box (Example 12), and Feature-Level isolation (Example 13).

## Example 11: White-Box Secrets — Developer Controls Delivery

When deploying custom code, the developer *must* tell the system how their application reads credentials. The Component's pillar schema enforces the `inject` requirement.

**1. Platform Catalog: The Component (White-Box Enforcement)**

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: core/python-worker
  version: 2.0.0
  labels:
    component.aggrega.ai/type: "worker"
spec:
  schema:
    values:
      image: { type: string, required: true }
    # White-Box: developer MUST dictate delivery
    secrets:
      type: object
      additionalProperties:
        type: object
        properties:
          inject:
            type: object
            properties:
              env:  { type: object, additionalProperties: { type: string } }
              file: { type: object, additionalProperties: { type: string } }
            required: [inject]
```

**2. Platform Catalog: The Credential Feature**
A Feature labeled as a credential feature. The compiler enforces the partition: this Feature can only appear in `secrets:` blocks, never in `features:`.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Feature
metadata:
  name: core/aws-secrets-manager
  version: 1.0.0
  labels:
    feature.aggrega.ai/kind: "secret"       # The credential partition label
spec:
  schema:
    values:
      path: { type: string, required: true }
      key:  { type: string, required: true }
```

**3. Dev Domain: The Aggregate**
The developer tells the system exactly how their Python code reads the OpenAI key — as an environment variable named `OPENAI_API_KEY`.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: credentialed-worker
  version: 1.0.0
spec:
  components:
    my-agent:
      type: core/python-worker:2.0.0
      values:
        image: "corp/finance-agent:v2"
      secrets:
        openai_key:
          type: core/aws-secrets-manager:1.0.0
          values:
            path: /prod/ai/openai
            key: "api_token"
          inject:
            env:
              OPENAI_API_KEY: "api_token"   # Local env var : target provides key
```

**4. Ops Domain: The FeatureRecipe (Fetcher + Injector Pipeline)**
The FeatureRecipe implements the credential Feature. The Two-Part Plugin Principle splits the work: the Fetcher generates the cloud-specific CRD, the Injector mounts it. Swapping vaults (AWS → HashiCorp) only replaces the Fetcher; the Injector is reusable.

> **Status: the `pipeline:` field is currently `accepted but inert` — the schema accepts the array shape but the compiler does not yet execute the plugins. See [Status of the Language](../10-status.md#compilation-pipeline-phases) for current behaviour. The example below illustrates the designed flow.**

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: FeatureRecipe
metadata:
  name: eso-aws-fetcher
  version: 1.0.0
spec:
  provider: helm
  implements: core/aws-secrets-manager:1.0.0
  pipeline:
    - id: "eso_fetcher"
      plugin: secrets/aws-eso-crd-generator:1.0.0
      function: generate_external_secret
      with: |
        secret_path: "{{ .values.path }}"
        k8s_secret_name: "{{ .context.instance_id }}-{{ .secret_name }}"
        remote_key: "{{ .values.key }}"

    - id: "workload_injector"
      plugin: mutator/k8s-workload-injector:2.0.0
      function: inject_secret
      with: |
        k8s_secret_name: "{{ .steps.eso_fetcher.outputs.k8s_secret_name }}"
        target_container: "{{ .locals.primary_compute }}"
        env_injections: {{ toJson .inject.env }}
```

**5. Routing Domain: Manifest**
Credential Features are mapped under the `features` tier — the same tier as operational Features. There is no separate `secrets` section.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Manifest
metadata:
  name: credentialed-manifest
  version: 1.0.0
spec:
  mappings:
    helm:
      components:
        type:
          "core/python-worker": "python-worker-helm:1.0.0"
      features:
        type:
          # Credential Feature — same tier as operational Features
          "core/aws-secrets-manager": "eso-aws-fetcher:1.0.0"
```

---

## Example 12: Black-Box Secrets — Ops Controls Delivery

When deploying packaged infrastructure (e.g., Bitnami Redis), the developer provides the vault location but is blocked from dictating how the chart internally consumes the credential.

**1. Platform Catalog: The Component (Black-Box Enforcement)**
The `secretsSchema` declares the credential slot as required and blackbox (`inject: []`). The compiler auto-generates the schema rules that validate the developer's `secrets:` block — no `secrets:` pillar needed inside `schema:`.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: core/datastore/redis
  version: 1.0.0
  labels:
    component.aggrega.ai/type: stateful-server
spec:
  secretsSchema:
    admin_password:
      required: true
      inject: []                            # Blackbox: Recipe controls delivery.
      description: Redis auth password.
  schema:
    provides:
      host: { type: string }
      port: { type: string }
```

**2. Dev Domain: The Aggregate**
The developer provides the vault query but omits `inject`. If they attempt to add it, the slot's auto-generated schema rule fails the build.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: cached-app
  version: 1.0.0
spec:
  components:
    cache-db:
      type: core/redis:1.0.0
      secrets:
        admin_password:
          type: core/aws-secrets-manager:1.0.0   # Uses credential Feature from Example 11
          values:
            path: /prod/redis
            key: "master_pass"
          # inject: ← BANNED by the slot's auto-generated schema rule. Developer cannot dictate delivery.
      values: {}
```

**3. Ops Domain: The Base Recipe**
Ops dictates the exact physical secret name. The Bitnami chart's native `existingSecret` mechanism handles injection internally.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: redis-bitnami
  version: 1.0.0
spec:
  provider: helm
  implements: core/redis:1.0.0
  source:
    # Planned: provider-declared source keys, validated by the provider's Wasm plugin.
    # The built-in resolver today uses the { kind, url, version } form.
    registry: https://charts.bitnami.com/bitnami
    chart: redis
    version: 18.0.0
  locals:
    primary_compute: "redis-primary"
    # Recipe dictates the physical secret name for the Wasm pipeline
    secret_target_admin_password: "{{ .context.instance_id }}-redis-auth"
  provides:
    host: "{{ .context.instance_id }}"
    port: "6379"
  valuesMapping: |
    auth:
      existingSecret: "{{ .context.instance_id }}-redis-auth"
      existingSecretPasswordKey: "redis-password"
```

**4. Ops Domain: The FeatureRecipe**
The Fetcher plugin dynamically indexes the Base Recipe's exported key using the `.secret_name` context variable (`"admin_password"`) to extract the dictated physical name.

> **Status: the `pipeline:` field is currently `accepted but inert` — the schema accepts the array shape but the compiler does not yet execute the plugins. See [Status of the Language](../10-status.md#compilation-pipeline-phases) for current behaviour. The example below illustrates the designed flow.**

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: FeatureRecipe
metadata:
  name: eso-aws-blackbox
  version: 1.0.0
spec:
  provider: helm
  implements: core/aws-secrets-manager:1.0.0
  pipeline:
    - id: "eso_fetcher"
      plugin: secrets/aws-eso-crd-generator:1.0.0
      function: generate_external_secret
      with: |
        secret_path: "{{ .values.path }}"
        # Dynamically reads the target name dictated by the Base Recipe
        k8s_secret_name: '{{ index .locals (printf "secret_target_%s" .secret_name) }}'
        remote_key: "{{ .values.key }}"
```

---

## Example 13: Feature-Level Secrets — Isolated Proxy Credentials

A Feature (like an AI guardrail proxy) demands its own API key. The credential is completely isolated from the parent Component — the Python worker never sees the proxy's authentication.

**1. Platform Catalog: The Feature with `secretsSchema`**

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Feature
metadata:
  name: core/lakera-guard
  version: 1.0.0
spec:
  secretsSchema:
    lakera_api_key:
      required: true
      inject: []
      description: Lakera Guard proxy API key.
  appliesTo: "component.aggrega.ai/type in (server, worker)"
  schema:
    values:
      action: { type: string, enum: [redact, block], default: redact }
```

**2. Dev Domain: The Aggregate**
The `secrets` block nests inside the Feature, perfectly isolating the credential from the parent Component.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: guarded-fleet
  version: 1.0.0
spec:
  components:
    finance-agent:
      type: core/python-worker:1.0.0        # Uses Component from Example 7
      values:
        image: "corp/finance-agent:v2"
      features:
        ai-guard:
          type: core/lakera-guard:1.0.0
          values:
            action: "redact"
          secrets:
            lakera_api_key:
              type: core/aws-secrets-manager:1.0.0
              values:
                path: /prod/lakera
                key: "api_key"
              inject:
                env:
                  LAKERA_GUARD_API_KEY: "api_key"
```

**Compilation:** The compiler first executes the credential FeatureRecipe's Fetcher plugin to generate the vault CRD. Then, because the credential is scoped to the Feature, it passes the resolved pointer strictly to the `FeatureRecipe`'s Wasm pipeline. The Feature's plugin generates the sidecar proxy and mounts `LAKERA_GUARD_API_KEY` directly to it, leaving the parent Python worker container untouched.
