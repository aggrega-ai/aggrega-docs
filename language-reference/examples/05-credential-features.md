# Credential Features

The credential pillar uses `featuresSchema` validation (see [entities/component.md](../entities/component.md#credential-slots-secretsschema)), the standard library's credential Feature family, and provider-specific FeatureRecipes to form a complete black-box secret pipeline. This chapter walks through the flow end-to-end using shipped standard-library entities.

## The Credential Feature Family

A credential Feature carries the `feature.aggrega.ai/kind: secret` label. The label is catalog metadata describing what the attachment produces; no compiler branch reads it, and a credential Feature is attached under `features:` like any other Feature. The developer references a credential Feature by type in a `features:` attachment; the Manifest maps it to a provider-specific FeatureRecipe per target environment.

The standard library splits credential Features by *result* — what the FeatureRecipe ultimately does with the secret:

- **`core/secret-value`** delivers a value into the inject pipe. The FeatureRecipe writes the secret into the consuming component's environment (a chart value, an env var) and contributes no standalone resource.
- **`core/referenced-secret`** materializes a referenceable secret *resource* — a Kubernetes Secret, an AWS Secrets Manager secret, a Vault entry — and publishes that resource's identity through a `schema.provides` output contract so a consumer can point at it.

**`core/secret-value` — injected value.**

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
      origin: { type: string, required: true }
      key:    { type: string, default: "value" }
```

**`core/referenced-secret` — referenceable resource.** It declares the same `values` inputs plus a `provides` output contract: `name` (the produced resource's provider-neutral locator — a Kubernetes Secret name, an AWS Secrets Manager ARN, a Vault path) and `key` (the data field within it). A consumer reads these as `.features.<slot>.provides.name` and `.features.<slot>.provides.key`.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Feature
metadata:
  name: core/referenced-secret
  version: 1.0.0
  labels:
    feature.aggrega.ai/kind: secret
spec:
  schema:
    values:
      origin: { type: string, required: true }
      key:    { type: string, default: "value" }
    provides:
      name: { type: string }
      key:  { type: string }
```

A credential Feature that declares a `provides` contract obliges every FeatureRecipe implementing it to publish those keys — the build halts if a FeatureRecipe omits one. This is the producer-side guarantee that makes the consumer's `.features.<slot>.provides.<key>` read safe.

## Provider-Specific FeatureRecipes

**`k8s-secret-from-parameter`** (for dev and local workflows) implements `core/referenced-secret`. It generates a Kubernetes Secret from a literal value passed via Release parameters, and publishes the generated Secret's identity as `provides`. The emitted Secret derives its name and data key from that same `provides`, so the name is authored exactly once — and it emits the resource inline via `artifacts:`, with no chart to ship:

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: FeatureRecipe
metadata:
  name: k8s-secret-from-parameter
  version: 1.0.0
spec:
  capability: helm
  implements: core/referenced-secret:1.0.0
  provides:
    name: "{{ .context.instance_id }}-{{ .attachment_name }}"
    key:  "{{ .values.key }}"
  # Emit a standalone Secret whose name and data key derive from the
  # published provides, so the rendered Secret and the consumer's
  # .features.<slot>.provides are one authored source. Self-contained.
  artifacts:
    secret.yaml: |
      apiVersion: v1
      kind: Secret
      metadata:
        name: "{{ .provides.name }}"
      stringData:
        "{{ .provides.key }}": "{{ .values.origin }}"
```

**`dotenv-secret`** (Compose, local dev) implements `core/secret-value`. It maps a secret to a `.env` file entry that Docker Compose resolves at runtime — an injected value, no standalone resource and no `provides`:

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: FeatureRecipe
metadata:
  name: dotenv-secret
  version: 1.0.0
spec:
  capability: compose
  implements: core/secret-value:1.0.0
  injectMapping: |
    env:
      {{ .values.key }}: "{{ .values.origin }}"
```

`env-secret` follows the same injected-value shape for the Helm provider, writing the value into the component's inject pipe rather than producing a resource.

## End-to-End Flow

The six steps from developer authoring to compiled output, using the referenceable path (`k8s-secret-from-parameter`):

1. **Developer writes the Aggregate** with a `features:` attachment referencing `core/referenced-secret`:

    ```yaml
    features:
      root_password:
        type: core/referenced-secret:1.0.0
        values:
          origin: "{{ .parameters.db_root_pass }}"
          key: mariadb-root-password
    ```

    The `root_password` slot has no `inject:` block here. The Component's `featuresSchema` declares `inject: []` for this slot (blackbox), so the slot's auto-generated schema rule rejects any developer-authored `inject:` — delivery is the Recipe's concern.

2. **Ops writes the Release** supplying the parameter value:

    ```yaml
    spec:
      parameters:
        db_root_pass: "mypassword"
      boundaries:
        production:
          # ... boundary infra ...
    ```

3. **Ops writes the Manifest** mapping `core/referenced-secret` to the provider-specific FeatureRecipe:

    ```yaml
    spec:
      mappings:
        helm:
          features:
            type:
              "core/referenced-secret": "k8s-secret-from-parameter:1.0.0"
    ```

4. **Base Recipe** (e.g., `mariadb-bitnami`) references the produced Secret by reading the slot's published locator — no name re-derivation on the consuming side:

    ```yaml
    valuesMapping: |
      auth:
        existingSecret: "{{ .features.root_password.provides.name }}"
    ```

5. **Compilation runs:**
    - Step 1 validates the attachment against the auto-generated schema rules derived from the Component's `featuresSchema`.
    - The credential FeatureRecipe's `provides` is evaluated once, producing the slot's `name` and `key`. Because the FeatureRecipe's emitted Secret derives its `metadata.name` from `{{ .provides.name }}` and the consumer reads `.features.root_password.provides.name`, both sides resolve from that single evaluation — the rendered Secret name and the consumer's reference are the same string by construction.
    - Phase B evaluates the base Recipe's `valuesMapping` (Helm renders the MariaDB chart referencing the published Secret name) and the `k8s-secret-from-parameter` FeatureRecipe's `artifacts:` (emitting the Kubernetes Secret manifest with the matching name).

6. **Output:** `dist/boundaries/production/` contains the MariaDB Deployment and Service (from the base Recipe) plus a Kubernetes Secret (from the credential FeatureRecipe). The Deployment's `auth.existingSecret` references the same name the Secret carries.

## Secret Naming Across Base Recipe and FeatureRecipe

A base Recipe's `valuesMapping` needs to reference the Kubernetes Secret the credential FeatureRecipe emits. For a `core/referenced-secret` slot, the FeatureRecipe publishes the resource's locator through its `provides` contract, and the consumer reads it as `.features.<slot>.provides.name`:

```gotemplate
existingSecret: "{{ .features.root_password.provides.name }}"
```

The name is authored once — on the producing FeatureRecipe's `provides` — and every reader resolves from that single published value. There is no naming convention for both sides to agree on and no shared `locals` entry to keep aligned: changing the naming scheme is an edit on the FeatureRecipe's `provides` alone, and the contract guarantees the key is present for the consumer to read.

A runnable end-to-end version of this flow — referenceable-secret + `secretKeyRef` on helm, inject-value on compose, and the non-referenceable rejection — is in [`credential-secretkeyref/`](credential-secretkeyref/README.md).

*The Two-Part Plugin extension for vault-fetching FeatureRecipes — a Fetcher Wasm plugin that generates vault-specific CRDs (such as an External Secrets `ExternalSecret`) plus an Injector Wasm plugin that mounts the fetched secret into workload containers — is under active development. The architectural scaffolding ships today (FeatureRecipe `pipeline:` arrays for Wasm plugin chaining, the `provides` output contract); the specific vault-fetching FeatureRecipes and their Wasm plugins land as the standard library catalog expands.*
