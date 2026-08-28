# Credential Features

The credential pillar uses `featuresSchema` validation (see [entities/component.md](../entities/component.md#attachment-slots-featuresschema)), the standard library's credential Feature family, and provider-specific FeatureRecipes to form a complete black-box secret pipeline. This chapter walks through the flow end-to-end using shipped standard-library entities.

## The Credential Feature Family

A credential Feature carries the `feature.aggrega.ai/kind: secret` label. The label is catalog metadata describing what the attachment produces; no compiler branch reads it, and a credential Feature is attached under `features:` like any other Feature. The developer references a credential Feature by type in a `features:` attachment; the Manifest maps it to a provider-specific FeatureRecipe per target environment.

The standard library splits credential Features by *result* — what the FeatureRecipe ultimately does with the secret:

- **`core/secret-value`** delivers a value into the inject pipe. The FeatureRecipe writes the secret into the consuming component's environment (a chart value, an env var) and contributes no standalone resource.
- **`core/secret-provided`** also results in a delivered value, but exposes it as a `provides` key instead of injecting it directly, so the attachment dictates delivery with its own `secret.inject` block on a transparent slot.
- **`core/referenced-secret`** materializes a referenceable secret *resource* — a Kubernetes Secret, an AWS Secrets Manager secret, a Vault entry — and publishes that resource's identity through a `schema.provides` output contract so a consumer can point at it.
- **`core/referenced-secret-set`** materializes one such resource carrying a caller-supplied *set* of data keys, and publishes the resource's locator alone. It suits a consumer whose target already fixes the key names it reads — a chart expecting a Secret with several named keys — so there is no per-key locator to publish. See [`mariadb-bitnami-credential-set/`](mariadb-bitnami-credential-set/README.md) and [`multikey-secret-synth/`](multikey-secret-synth/README.md).
- **`core/generated-secret`** produces nothing at all, because the target engine generates and manages the credential itself. The deployment uses it to say that a slot is delegated to the engine.

Two things separate the members: who supplies the material — the deployment authors it or names where to fetch it, or the target engine owns it outright as with `core/generated-secret` — and what the attachment yields, which is the *result* the list above groups by. They are peers — same label, same attachment surface, same slot — so a credential slot is always bound, and what varies between deployments is *what* binds it.

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

**`core/generated-secret` — engine-managed.** It declares neither `values` nor `provides`: the deployment supplies no material, and the attachment publishes nothing for a consumer to read. Attaching it states that the credential's whole lifecycle belongs to the target — a managed cloud database that generates and rotates its own master password, for example.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Feature
metadata:
  name: core/generated-secret
  version: 1.0.0
  labels:
    feature.aggrega.ai/kind: secret
spec: {}
```

The directive that turns engine management on is the component's Recipe's, not the Feature's: a Terraform RDS Recipe sets `manage_master_user_password`, a CloudFormation one sets `ManageMasterUserPassword`. So the FeatureRecipes implementing `core/generated-secret` are pure wiring — `capability` and `implements` and nothing else — and render no bytes. The standard library ships them for the `terraform` and `cloudformation` capabilities, matching the managed-database Recipes that carry the directive. The [`terraform-rds`](terraform-rds/) example binds a required slot this way, and its rendered HCL is identical to the same example with no attachment at all: the slot is bound, and nothing is emitted for it.

## Provider-Specific FeatureRecipes

**`k8s-secret-from-parameter`** (for dev and local workflows) implements `core/referenced-secret`. It generates a Kubernetes Secret from a literal value the deployment supplies, and publishes the generated Secret's identity as `provides`. The emitted Secret derives its name and data key from that same `provides`, so the name is authored exactly once. The Secret comes from a small co-located Helm chart named by `source:`, whose values the `valuesMapping` feeds from the published `provides`:

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
    # Underscores in the slot name are normalized to hyphens, so a slot named
    # app_user_password publishes a valid Kubernetes object name.
    name: '{{ .context.instance_id }}-{{ .attachment_name | replace "_" "-" }}'
    key: "{{ .values.key }}"
  # A co-located chart renders the Secret. Its values come from the published
  # provides, so the rendered Secret and the consumer's
  # .features.<slot>.provides are one authored source.
  source: ./chart
  valuesMapping: |
    secretName: "{{ .provides.name }}"
    dataKey: "{{ .provides.key }}"
    origin: {{ .values.origin | toJson }}
```

The chart is one template. Both of its names come from the values above, so nothing re-derives the Secret's identity inside the chart:

```yaml
# chart/templates/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: {{ .Values.secretName }}
stringData:
  {{ .Values.dataKey }}: {{ .Values.origin | quote }}
```

Both excerpts omit one thing the shipped recipe carries: it also passes the scope's namespace through to the chart, when the scope declares one, so the emitted Secret lands beside the workload that references it.

**Two FeatureRecipes can implement one Feature at the same capability**, and the choice between them is then the Manifest's. `k8s-external-secret` also implements `core/referenced-secret` for `helm`: rather than a Secret carrying the material, it renders an `ExternalSecret` naming an entry in a secret store, which an operator running in the cluster reconciles into a Secret. Both publish the same `provides` keys, so the consuming Recipe reads the same locator either way and its rendered reference is unchanged — which is what makes the two substitutable. [`credential-shape-per-target/`](credential-shape-per-target/README.md) builds one Aggregate against both bindings and compares the output.

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
    - Resolution validates the attachment against the auto-generated schema rules derived from the Component's `featuresSchema`.
    - The credential FeatureRecipe's `provides` is evaluated once, producing the slot's `name` and `key`. Because the FeatureRecipe feeds its chart's `secretName` from that published `provides.name` and the consumer reads `.features.root_password.provides.name`, both sides resolve from that single evaluation — the rendered Secret name and the consumer's reference are the same string by construction.
    - Base rendering evaluates the base Recipe's `valuesMapping` (Helm renders the MariaDB chart referencing the published Secret name) and the `k8s-secret-from-parameter` FeatureRecipe's own chart (emitting the Kubernetes Secret manifest with the matching name).

6. **Output:** `dist/boundaries/production/` contains the MariaDB Deployment and Service (from the base Recipe) plus a Kubernetes Secret (from the credential FeatureRecipe). The Deployment's `auth.existingSecret` references the same name the Secret carries.

## Secret Naming Across Base Recipe and FeatureRecipe

A base Recipe's `valuesMapping` needs to reference the Kubernetes Secret the credential FeatureRecipe emits. For a `core/referenced-secret` slot, the FeatureRecipe publishes the resource's locator through its `provides` contract, and the consumer reads it as `.features.<slot>.provides.name`:

```gotemplate
existingSecret: "{{ .features.root_password.provides.name }}"
```

The name is authored once — on the producing FeatureRecipe's `provides` — and every reader resolves from that single published value. There is no naming convention for both sides to agree on and no shared `locals` entry to keep aligned: changing the naming scheme is an edit on the FeatureRecipe's `provides` alone, and the contract guarantees the key is present for the consumer to read.

A runnable end-to-end version of this flow — referenceable-secret + `secretKeyRef` on helm, inject-value on compose, and the non-referenceable rejection — is in [`credential-secretkeyref/`](credential-secretkeyref/README.md).

Because the name is published rather than agreed, changing which FeatureRecipe is bound does not move it. [`credential-shape-per-target/`](credential-shape-per-target/README.md) builds one Aggregate twice — once bound to `k8s-secret-from-parameter`, once to `k8s-external-secret` — and the consuming StatefulSet's `secretKeyRef` comes out byte-identical from both, while the resource it points at is a Secret in one and an `ExternalSecret` in the other.

Whether each consumer holds its own credential or several share one is a deployment choice made where the credential is attached, not a property of the catalog entity. [`model-api-key-sharing/`](model-api-key-sharing/README.md) builds both shapes with two consumers each — the multiplicity at which they differ — and shows what each renders, including how a component-scoped fill refines a subsystem-wide attachment field by field.

*The Two-Part Plugin extension for vault-fetching FeatureRecipes — a Fetcher Wasm plugin that generates vault-specific CRDs (such as an External Secrets `ExternalSecret`) plus an Injector Wasm plugin that mounts the fetched secret into workload containers — is under active development. The architectural scaffolding ships today (FeatureRecipe `pipeline:` arrays for Wasm plugin chaining, the `provides` output contract), and the chart-rendered route to an `ExternalSecret` is available now through `k8s-external-secret`; the plugin-generated vault-fetching FeatureRecipes and their Wasm plugins land as the standard library catalog expands.*
