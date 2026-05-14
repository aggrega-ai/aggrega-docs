# Credential Features

The credential pillar uses `secretsSchema` validation (see [entities/component.md](../entities/component.md#credential-slots-secretsschema)), the `core/secret-value` abstract Feature, and provider-specific FeatureRecipes to form a complete black-box secret pipeline. This chapter walks through the flow end-to-end using shipped standard-library entities.

## `core/secret-value` — the Abstract Credential Feature

`core/secret-value` is a provider-agnostic credential Feature. The developer references it by type in their `secrets:` block; the Manifest maps it to a provider-specific FeatureRecipe per target environment.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Feature
metadata:
  name: core/secret-value
  version: 1.0.0
  labels:
    feature.aggrega.ai/kind: secret
spec:
  schema:
    values:
      source: { type: string, required: true }
      key:    { type: string, default: "value" }
```

The `feature.aggrega.ai/kind: secret` label makes this a credential Feature, subject to the compiler's partition rule: it may only appear in a Component's `secrets:` block, never in the `features:` block.

## Provider-Specific FeatureRecipes

Two shipped FeatureRecipes implement `core/secret-value` for different targets.

**`k8s-secret-from-parameter`** (for dev and local workflows). Generates a Kubernetes Secret from a literal value passed via Release parameters:

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: FeatureRecipe
metadata:
  name: k8s-secret-from-parameter
  version: 1.0.0
spec:
  provider: helm
  implements: core/secret-value:1.0.0
  source: ./charts/k8s-secret
  valuesMapping: |
    secretName: "{{ .context.instance_id }}-{{ .secret_name }}"
    secretKey: "{{ .values.key }}"
    secretValue: "{{ .values.source }}"
```

**`dotenv-secret`** (Compose, local dev). Maps a secret to a `.env` file entry that Docker Compose resolves at runtime:

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: FeatureRecipe
metadata:
  name: dotenv-secret
  version: 1.0.0
spec:
  provider: compose
  implements: core/secret-value:1.0.0
  injectMapping: |
    env:
      {{ .values.key }}: "{{ .values.source }}"
```

## End-to-End Flow

The six steps from developer authoring to compiled output:

1. **Developer writes the Aggregate** with a `secrets:` block referencing `core/secret-value`:

    ```yaml
    secrets:
      root_password:
        type: core/secret-value:1.0.0
        values:
          source: "{{ .parameters.db_root_pass }}"
          key: mariadb-root-password
    ```

    The `root_password` slot has no `inject:` block here. The Component's `secretsSchema` declares `inject: []` for this slot (blackbox), so the slot's auto-generated schema rule rejects any developer-authored `inject:` — delivery is the Recipe's concern.

2. **Ops writes the Release** supplying the parameter value:

    ```yaml
    spec:
      parameters:
        db_root_pass: "mypassword"
      boundaries:
        production:
          # ... boundary infra ...
    ```

3. **Ops writes the Manifest** mapping `core/secret-value` to the provider-specific FeatureRecipe:

    ```yaml
    spec:
      mappings:
        helm:
          features:
            type:
              "core/secret-value": "k8s-secret-from-parameter:1.0.0"
    ```

4. **Base Recipe** (e.g., `mariadb-bitnami`) declares a stable name for the secret in its `locals` and consumes it in its `valuesMapping`:

    ```yaml
    locals:
      secret_target_root_password: "{{ .context.instance_id }}-mariadb-auth"
    valuesMapping: |
      auth:
        existingSecret: "{{ .locals.secret_target_root_password }}"
    ```

5. **Compilation runs:**
    - Step 1 validates the `secrets:` block against the auto-generated schema rules derived from the Component's `secretsSchema`.
    - Pass 1 evaluates the base Recipe's `locals` (producing the deterministic secret name).
    - Phase B evaluates the base Recipe's `valuesMapping` (Helm renders the MariaDB chart referencing `secret_target_root_password`).
    - Phase B also evaluates the `k8s-secret-from-parameter` FeatureRecipe's `valuesMapping` with `.secret_name = "root_password"`, producing a Kubernetes Secret manifest with the matching name.

6. **Output:** `dist/boundaries/production/` contains the MariaDB Deployment and Service (from the base Recipe) plus a Kubernetes Secret (from the credential FeatureRecipe). The Deployment's `auth.existingSecret` references the same deterministic name the Secret carries.

## Secret Naming Across Base Recipe and FeatureRecipe

The base Recipe's `valuesMapping` needs to reference the Kubernetes Secret the credential FeatureRecipe emits. Two patterns keep those names aligned:

**Convention-based.** Both Recipes construct the name independently following the same convention (`{instance_id}-{component}-auth` or similar). Simple, but relies on both sides agreeing on the convention.

**Export Contract.** The base Recipe declares the expected secret name in its `locals` (for example, `secret_target_root_password: "{{ .context.instance_id }}-mariadb-auth"`). The FeatureRecipe reads from that shared `locals` entry rather than constructing the name itself:

```gotemplate
{{ index .locals (printf "secret_target_%s" .secret_name) }}
```

This removes the convention coupling — changing the naming scheme only needs an edit on the base Recipe side. Standard-library FeatureRecipes use this pattern.

*The Two-Part Plugin extension for vault-fetching FeatureRecipes — a Fetcher Wasm plugin that generates vault-specific CRDs (such as an External Secrets `ExternalSecret`) plus an Injector Wasm plugin that mounts the fetched secret into workload containers — is under active development. The architectural scaffolding ships today (FeatureRecipe `pipeline:` arrays for Wasm plugin chaining, the `.locals` Export Contract); the specific vault-fetching FeatureRecipes and their Wasm plugins land as the standard library catalog expands.*
