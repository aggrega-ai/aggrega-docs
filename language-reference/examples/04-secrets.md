# Secrets

## The secret-delivery checklist

Implementing a credential pattern end-to-end touches six surfaces across the four domains. The mental model authors carry when wiring a new secret: every credential flows through these six touch-points before it reaches a running container.

| Step | Surface | Action |
| --- | --- | --- |
| 1 | Component `featuresSchema:` | **Declare** the credential slot. Slot definitions specify the slot name, whether it is `required`, the `inject:` allowlist (`[env]`, `[file]`, `[]` for blackbox), and a description. The Component author chooses White-Box (transparent: developer dictates delivery) or Black-Box (opaque: Recipe controls delivery) by setting the `inject:` allowlist accordingly. |
| 2 | Credential Feature `schema:` | **Define** the vault-query contract for the credential type. The Feature carries the `feature.aggrega.ai/kind: secret` label and declares the values keys (e.g., `path`, `key`) that authors supply when requesting the credential. |
| 3 | Aggregate component instance `features:` block | **Request** the credential at the developer's authoring surface — the one attachment keyword, the same one an operational Feature uses. The attachment specifies the credential Feature `type`, the store-query `values`, and (for White-Box slots only) the `inject:` mapping that wires the resolved credential to the application's expected delivery shape. |
| 4 | FeatureRecipe `pipeline:` (Two-Part Plugin Principle) | **Implement** the credential's runtime resolution. The Fetcher plugin generates the cloud-specific CRD (`ExternalSecret`, `VaultSecret`, etc.) referencing the developer's vault path; the Injector plugin mounts the resolved Kubernetes Secret to the target container at the developer's requested key. Swapping vaults (AWS → HashiCorp) only replaces the Fetcher; the Injector is reusable. |
| 5 | Manifest `mappings.features.type` | **Bind** the credential Feature type to its FeatureRecipe, in the same `features.type` tier as operational Features. The build dispatches each resolved FeatureRecipe to the provider its `capability` names. |
| 6 | Recipe `valuesMapping:` template (Black-Box only) | **Reference** the dictated physical secret name when the slot is Black-Box. The Recipe's `valuesMapping:` consumes it — on the `helm` target `{{ .context.rendered_name }}-{{ .locals.secret_target_<slot> }}`, the local carrying the suffix the Recipe chooses (or the equivalent Recipe-published pointer) — and feeds the chart's native secret-mount mechanism (`existingSecret`, etc.). White-Box slots skip this step — the Workload's `attachments:` block carries the delivery directly. |

The split between White-Box and Black-Box determines how many touch-points a particular credential pattern requires. White-Box covers the first five surfaces above; Black-Box covers all six — the heavier of the two, and the one Recipe authors most often implement when sourcing packaged infrastructure (Bitnami charts, managed services, etc.).

The four worked examples below demonstrate the pattern across the canonical scenarios: White-Box (Example 11), Black-Box (Example 12), a Feature's own credential (Example 13), and a credential carried on one connection (Example 14).

## Example 11: White-Box Secrets — Developer Controls Delivery

When deploying custom code, the developer may tell the system how their application reads credentials. The Component's credential slot permits it: the slot's `inject:` allowlist names the delivery mechanisms an attachment may dictate — here `env` and `file` — and does not require an attachment to dictate one.

**1. Platform Catalog: The Component (White-Box Enforcement)**

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Component
metadata:
  name: core/python-worker
  version: 2.0.0
  labels:
    component.aggrega.ai/type: "worker"
spec:
  featuresSchema:
    openai_key:
      required: true
      inject: [env, file]                   # White-Box: the developer may dictate delivery.
      description: OpenAI API key.
  schema:
    values:
      image: { type: string, required: true }
```

**2. Platform Catalog: The Credential Feature**
A Feature labeled as a credential feature. The label is metadata describing what the attachment produces; it is attached under `features:` like any other Feature.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Feature
metadata:
  name: core/aws-secrets-manager
  version: 1.0.0
  labels:
    feature.aggrega.ai/kind: "secret"       # Opaque metadata: names what the attachment produces
spec:
  schema:
    values:
      path: { type: string, required: true }
      key:  { type: string, required: true }
```

**3. Dev Domain: The Aggregate**
The developer tells the system exactly how their Python code reads the OpenAI key — as an environment variable named `OPENAI_API_KEY`.

```yaml
apiVersion: aggrega.ai/v1beta1
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
      features:
        openai_key:
          type: core/aws-secrets-manager:1.0.0
          values:
            path: /prod/ai/openai
            key: "api_token"
          inject:
            env:
              - in: OPENAI_API_KEY   # Local env var
                from: "api_token"    # A key the FeatureRecipe consumes itself
```

The `inject:` block is the developer's choice, not a requirement. With it, the credential's FeatureRecipe receives the directive at `.inject.env` — `{"OPENAI_API_KEY":"api_token"}` — and hands it to the Injector below. The FeatureRecipe publishes no `api_token` key: it consumes the directive itself, reading `.inject` in its pipeline, so the entry is delivered by the Injector rather than through the component's `.context.inject`, and the build accepts a `from:` key the FeatureRecipe does not publish. An entry naming a key that the FeatureRecipe neither publishes nor reads at `.inject` halts the build instead, since nothing would deliver it. Without it, the attachment still fills the slot and the build accepts it; the FeatureRecipe receives no directive, so delivery is left to the FeatureRecipe. A block naming a mechanism the slot does not list halts the build: `arg`, for example, because the slot permits only `env` and `file`.

**4. Ops Domain: The FeatureRecipe (Fetcher + Injector Pipeline)**
The FeatureRecipe implements the credential Feature. The Two-Part Plugin Principle splits the work: the Fetcher generates the cloud-specific CRD, the Injector mounts it. Swapping vaults (AWS → HashiCorp) only replaces the Fetcher; the Injector is reusable.

> **The `pipeline:` field executes during `aggrega build`: the compiler runs each declared step in order against the rendered document set. See [Status of the Language](../10-status.md#compilation-pipeline-phases) for the per-phase readiness.**

```yaml
apiVersion: aggrega.ai/v1beta1
kind: FeatureRecipe
metadata:
  name: eso-aws-fetcher
  version: 1.0.0
spec:
  capability: helm
  implements: core/aws-secrets-manager:1.0.0
  pipeline:
    - id: "eso_fetcher"
      plugin: pipeline-step/aws-eso-crd-generator:1.0.0
      function: generate_external_secret
      with: |
        secret_path: "{{ .values.path }}"
        # The host's rendered name, spelled in the characters a Kubernetes name
        # allows, and the slot name with its underscores folded to hyphens.
        k8s_secret_name: '{{ .context.rendered_name }}-{{ .attachment_name | replace "_" "-" }}'
        remote_key: "{{ .values.key }}"

    - id: "workload_injector"
      plugin: pipeline-step/k8s-workload-injector:2.0.0
      function: inject_secret
      with: |
        k8s_secret_name: "{{ .steps.eso_fetcher.outputs.k8s_secret_name }}"
        target_container: "{{ .locals.primary_compute }}"
        env_injections: {{ if .inject }}{{ toJson .inject.env }}{{ else }}{}{{ end }}
        file_injections: {{ if .inject }}{{ toJson .inject.file }}{{ else }}{}{{ end }}
```

**5. Routing Domain: Manifest**
Credential Features are mapped under the `features` tier — the same tier as operational Features. There is no separate `secrets` section.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Manifest
metadata:
  name: credentialed-manifest
  version: 1.0.0
spec:
  mappings:
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
The `featuresSchema` declares the credential slot as required and blackbox (`inject: []`). The compiler auto-generates the schema rules that validate the developer's attachment — no separate pillar needed inside `schema:`.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Component
metadata:
  name: core/datastore/redis
  version: 1.0.0
  labels:
    component.aggrega.ai/type: stateful-server
spec:
  featuresSchema:
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
apiVersion: aggrega.ai/v1beta1
kind: Aggregate
metadata:
  name: cached-app
  version: 1.0.0
spec:
  components:
    cache-db:
      type: core/datastore/redis:1.0.0
      features:
        admin_password:
          type: core/aws-secrets-manager:1.0.0   # Uses credential Feature from Example 11
          values:
            path: /prod/redis
            key: "admin_pass"
          # inject: ← BANNED by the slot's auto-generated schema rule. Developer cannot dictate delivery.
      values: {}
```

**3. Ops Domain: The Base Recipe**
Ops dictates the exact physical secret name. The chart's native `existingSecret` mechanism handles injection internally. The name is the component's rendered name — the name the helm provider gives the component's resources, spelled in the characters a Kubernetes name allows — followed by a suffix the Recipe chooses. A `locals:` entry cannot read `.context.rendered_name`, so the local carries the suffix alone, and each template that writes the full name joins the two.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Recipe
metadata:
  name: redis-chart
  version: 1.0.0
spec:
  capability: helm
  implements: core/datastore/redis:1.0.0
  source:
    # A chart repository root paired with the chart's name.
    kind: helm-https-chart
    url: https://charts.example.com
    chart: redis
    version: 18.0.0
  locals:
    primary_compute: "redis-primary"
    # Recipe dictates the physical secret name for the Wasm pipeline: the
    # suffix it follows the component's rendered name with
    secret_target_admin_password: "redis-auth"
  provides:
    host: "{{ .context.rendered_name }}"
    port: "6379"
  valuesMapping: |
    fullnameOverride: "{{ .context.rendered_name }}"
    auth:
      existingSecret: "{{ .context.rendered_name }}-{{ .locals.secret_target_admin_password }}"
      existingSecretPasswordKey: "redis-password"
```

For a runnable end-to-end walkthrough of the `.features.<slot>.provides.name` → chart `existingSecret` flow — a sourced Recipe consuming a multi-key credential Secret by its published name — see the [`mariadb-bitnami-credential-set`](mariadb-bitnami-credential-set/README.md) example.

**4. Ops Domain: The FeatureRecipe**
The Fetcher step's `with:` block indexes the Base Recipe's exported key using the `.attachment_name` context variable (`"admin_password"`) to extract the dictated suffix, and prefixes the host's rendered name, which an attachment's templates read as `.context.rendered_name` — the same two parts the Recipe's `existingSecret` joins, so the Secret the Fetcher generates is the one the chart mounts.

> **The `pipeline:` field executes during `aggrega build`: the compiler runs each declared step in order against the rendered document set. See [Status of the Language](../10-status.md#compilation-pipeline-phases) for the per-phase readiness.**

```yaml
apiVersion: aggrega.ai/v1beta1
kind: FeatureRecipe
metadata:
  name: eso-aws-blackbox
  version: 1.0.0
spec:
  capability: helm
  implements: core/aws-secrets-manager:1.0.0
  pipeline:
    - id: "eso_fetcher"
      plugin: pipeline-step/aws-eso-crd-generator:1.0.0
      function: generate_external_secret
      with: |
        secret_path: "{{ .values.path }}"
        # The host's rendered name, then the suffix the Base Recipe dictates
        k8s_secret_name: '{{ .context.rendered_name }}-{{ index .locals (printf "secret_target_%s" .attachment_name) }}'
        remote_key: "{{ .values.key }}"
```

---

## Example 13: A Feature's Own Credential

A Feature can need a credential of its own — a guardrail proxy that authenticates to an upstream service, a log shipper with an ingest token. The Feature declares the binding point in its **own** `featuresSchema`, exactly as a Component does, and the FeatureRecipe bound to it reads what fills that slot when it renders the Feature's workload.

**Attachments do not nest.** An attachment declares `type`, `description`, `values`, `uses` and `inject`, and the schema closes it there. The credential is attached *beside* the Feature, on the same component, under the name the Feature's slot declares — the slot name is what ties the two together. That holds for the connections a Feature draws too: a connection in the Feature's own `uses:` block carries no attachments, and a `features:` key on it is refused when the document loads, so a credential such a connection needs is a slot the Feature declares, filled beside the Feature exactly as below.

The guard Feature below, and the Component the Aggregate names, are entities this example's own catalog carries. The credential Feature `core/referenced-secret` and the FeatureRecipe `k8s-secret-from-parameter` that implements it are standard-library entities, walked through in [Credential Features](05-credential-features.md).

**1. Platform Catalog: The Feature declares its own slot**

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Feature
metadata:
  name: local/guard
  version: 1.0.0
spec:
  appliesTo: "component.aggrega.ai/type in (server, worker)"
  featuresSchema:
    guard_api_key:
      selector: "feature.aggrega.ai/kind=secret"
      sensitive: true
      inject: [env]                  # the Feature's own workload may read it as an env var
      description: The guardrail proxy's API key.
  schema:
    values:
      action: { type: string, enum: [redact, block], default: redact }
```

**2. Ops Domain: The FeatureRecipe renders the proxy and reads the slot**

The FeatureRecipe carries a `workload:`, so the attachment renders a workload of its own. Its container references the slot by name: `from:` names the slot, not the Secret the credential produces.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: FeatureRecipe
metadata:
  name: guard-proxy
  version: 1.0.0
spec:
  capability: helm
  implements: local/guard:1.0.0
  workload: |
    apiVersion: aggrega.ai/v1beta1
    kind: Workload
    form: stateless
    replicas: 1
    containers:
      guard:
        image: "guardrails/proxy:1.0.0"
        variables:
          GUARD_ACTION: "{{ .values.action }}"
        attachments:
          GUARD_API_KEY:
            from: guard_api_key
            as: env
        ports:
          proxy: 8443
```

**3. Dev Domain: The Aggregate**

Two attachments on one component: the Feature, and the credential that fills the Feature's slot. The component itself declares no credential slot.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Aggregate
metadata:
  name: guarded-fleet
  version: 1.0.0
spec:
  components:
    finance-agent:
      type: local/compute/guarded-worker
      values:
        image: "corp/finance-agent:v2"
      features:
        ai-guard:
          type: local/guard
          values:
            action: redact
        # Named for the slot the guard Feature declares — that is what fills it.
        guard_api_key:
          type: core/referenced-secret
          values:
            origin: dev-guard-key-change-me
            key: api-key
```

**4. Routing Domain: Manifest**

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Manifest
metadata:
  name: guarded-fleet-manifest
  version: 1.0.0
spec:
  mappings:
    components:
      type:
        local/compute/guarded-worker: helm/guarded-worker:1.0.0
    features:
      type:
        local/guard: guard-proxy:1.0.0
        core/referenced-secret: helm/k8s-secret-from-parameter:1.0.0
```

**What the build renders.** The credential FeatureRecipe emits the Secret; the guard FeatureRecipe emits its own Deployment, carrying the reference to it. Both excerpts below show each Deployment's containers.

```yaml
# the guard Feature's own Deployment
containers:
  - name: guard
    image: guardrails/proxy:1.0.0
    ports:
      - name: proxy
        containerPort: 8443
    env:
      - name: GUARD_API_KEY
        valueFrom:
          secretKeyRef:
            name: finance-agent-guard-api-key
            key: api-key
      - name: GUARD_ACTION
        value: redact
```

```yaml
# the host component's Deployment, from the same build
containers:
  - name: main
    image: corp/finance-agent:v2
    ports:
      - name: web
        containerPort: 8080
```

**What that gives you, stated exactly.** The reference lands on the container that asked for it and on no other: the host component's rendered Deployment carries no reference to the Secret, because its Recipe's Workload declares no `attachments:` entry naming the slot. Nor could it declare one — the slot belongs to the Feature, so a host Recipe reaching for it halts:

```text
[CATALOG_ERROR E0213] instance finance-agent
  rendering node "finance-agent"
  caused by: workload featuresSchema cross-check failed (Workload in Recipe guarded-worker:1.0.0, featuresSchema stage):
    .containers.main.attachments.GUARD_API_KEY.from: references slot "guard_api_key" which is not declared in the Component's featuresSchema — either declare the slot in the Component (or Feature) featuresSchema, or rename the reference to an existing slot
```

That is a statement about where the compiler routes bytes, and it is the whole of what the compiler offers here: the Secret it emits is an ordinary resource of the target platform, and what may read it once applied is that platform's concern. [Credential Model](../../architecture/08-credential-model.md) states that boundary in full.

**Two more things to know before you author one.** A workload entry naming a slot that nothing fills halts, because there is no published locator to resolve:

```text
[CATALOG_ERROR E0212]
  workload attachment slot is not referenceable (Workload in Recipe guard-proxy:1.0.0, slotReferenceability stage):
  .containers.guard.attachments.GUARD_API_KEY.from: slot "guard_api_key" is not referenceable: its resolved provides does not expose "name" (a workload attachment reference reads the provides keys name and key) — reference a slot filled by an attachment whose schema.provides declares the keys this reference reads, or deliver it through the slot's inject pipe rather than a workload reference
  .containers.guard.attachments.GUARD_API_KEY.from: slot "guard_api_key" is not referenceable: its resolved provides does not expose "key" (a workload attachment reference reads the provides keys name and key) — reference a slot filled by an attachment whose schema.provides declares the keys this reference reads, or deliver it through the slot's inject pipe rather than a workload reference
```

And on a Feature's slot, `required: true` is a declaration the workload cross-check reads; it does not halt on its own. A build whose guard Feature marks the slot required and attaches nothing to fill it completes. What makes the credential compulsory here is the workload reference above.

---

## Example 14: A Connection's Own Credential

A gateway reaching two models presents a different key to each — or a key to one and none to the other. A slot on the gateway itself holds one credential for the whole component, so it cannot say which connection a key belongs to. The credential goes on the **connection** instead: the gateway's socket declares the slot every connection through it may fill, and each connection fills it, or does not, on its own.

The gateway Component below, and its Recipe, are entities this example's own catalog carries. `core/referenced-secret`, `core/ai-model/openai`, `core/ai-model/ollama` and the two credential FeatureRecipes are standard-library entities.

**1. Platform Catalog: the socket declares the slot**

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Component
metadata:
  name: local/gateway/model-router
  version: 1.0.0
  labels:
    component.aggrega.ai/type: server
spec:
  usesSchema:
    models:
      selector: "component.aggrega.ai/category=ai-model"
      featuresSchema:
        credential:
          selector: "feature.aggrega.ai/kind=secret"
          sensitive: true
          inject: [env]
          description: The credential the gateway presents to the model this connection reaches.
```

**2. Dev Domain: the Aggregate attaches on the connection**

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Aggregate
metadata:
  name: edgecred
  version: "1.0.0"
spec:
  parameters:
    openai_key_secret: { type: string }
  components:
    router:
      type: local/gateway/model-router
      uses:
        models:
          gpt:
            target: gpt
            features:
              credential:            # a slot the `models` socket declares
                type: core/referenced-secret
                values:
                  origin: "{{ .parameters.openai_key_secret }}"
                  key: api-key
          plain:
            target: plain            # the local model checks no key, so this connection carries none
    gpt:
      type: core/ai-model/openai
      values: { model: gpt-4o-mini }
    plain:
      type: core/ai-model/ollama
      values: { model: llama3.1 }
```

**3. Routing Domain: the Manifest picks the realization, per type or for this one connection**

The attachment on the `gpt` connection is an attachment of `router` named `gpt.credential`, and the Manifest's per-instance tier keys it by that name. Here every `core/referenced-secret` renders a plain Secret, except the `gpt` connection's, which is fetched from a cluster secret store.

```yaml
spec:
  mappings:
    components:
      type:
        local/gateway/model-router: helm/model-router:1.0.0
        core/ai-model/openai:1.0.0: helm/openai:1.0.0
        core/ai-model/ollama:1.0.0: helm/ollama:1.0.0
    features:
      type:
        core/referenced-secret:1.0.0: helm/k8s-secret-from-parameter:1.0.0
      name:
        gpt.credential: helm/k8s-external-secret:1.0.0
```

The Release fulfils `openai_key_secret` — with this realization, the key of the entry to fetch — as `openai-team-a`.

**What the build renders.** One resource more than a build with no attachment on any connection: the `gpt` connection's credential, rendered on the gateway's side. The excerpt omits the provenance labels and annotations every rendered resource carries.

```yaml
# helm/router--gpt-zdcredential--router-externalsecret-router-gpt-credential.yaml
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: router-gpt.credential
spec:
  refreshInterval: "1h"
  secretStoreRef:
    name: platform-secret-store
    kind: ClusterSecretStore
  target:
    name: router-gpt.credential
    creationPolicy: Owner
  data:
    - secretKey: api-key
      remoteRef:
        key: "openai-team-a"
```

**What that gives you, stated exactly.** The credential belongs to the one connection that carries it: the `plain` connection renders nothing, and neither model's own output changes with what the gateway's connections carry. The attachment is not part of the gateway Recipe's `.features`, which holds only what the gateway's own block attaches. The gateway's Recipe reads it from its connection instead, at `.context.uses.gpt.features.credential` — the attachment shape, its resolved `provides` included, here the name `router-gpt.credential` and the key `api-key` — so a gateway reaching several models reads each model's own credential. Delivering it into the gateway's own container is not something this example shows. How the rendered names are composed — the dot kept in the resource name, written out as `zd` in the file name and the identity labels — is set out in [Naming a Rendered Resource](../templates/rendered-resource-names.md#names-derived-from-a-connections-attachment).

**A name the socket does not declare halts.** The socket's slots are the only names a connection through it may carry. The same Aggregate with the `gpt` connection's attachment written under `token`:

```text
[DEVELOPER_ERROR E0315] .spec.components.router.uses.models.gpt
  a connection carries an attachment under a name its socket declares no slot for (Aggregate edgecred, at .spec.components.router.uses.models.gpt, "token", on the connection "gpt", through socket "models", of component "router", the socket declaring the slots "credential"). Write the attachment under one of the slots the socket declares, or declare this slot in the socket's featuresSchema on the Component.
```

A Release sizes the attachment with `infra` on its own entry for the connection, or attaches a credential the Aggregate left out, naming its `type`; see [Per-edge connection configuration](../entities/release.md#per-edge-connection-configuration).

**When the operator names the secret.** The same gateway, with the `gpt` connection left out of the Aggregate and wired by the Release instead. A Release writes no `values`, so it names the secret in the attachment's `infra` — `core/referenced-secret` takes its `origin` from either pillar, exactly one per attachment:

```yaml
spec:
  components:
    router:
      uses:
        models:
          gpt:
            target: gpt
            features:
              credential:
                type: core/referenced-secret
                infra:
                  origin: openai-team-a
```

Bound to the same external-secret realization, the connection's credential renders the `ExternalSecret` above with `remoteRef.key: "openai-team-a"`. Its `secretKey` is `value`, not `api-key`: the data key stays a `values` leaf, which only the Aggregate writes, so an attachment the Release alone makes reads the Feature's default. An attachment carrying `origin` in both pillars — the Aggregate's `values` and the Release's `infra` for the one connection — or in neither halts the build at the Feature's own assertion, naming the attachment and the component; see [Credential Features](05-credential-features.md#who-names-the-credential-values-or-infra-exactly-one).
